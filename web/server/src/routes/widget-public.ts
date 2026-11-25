import { Router, type Response } from "express";
import { prisma, prismaUnscoped } from "../db/prisma";
import { isAllowedOrigin, SubmissionRateLimiter, validatePublicEnquiry } from "./widget-validation";

export const publicWidgetRouter = Router();
const limiter = new SubmissionRateLimiter();

type PublicWidget = NonNullable<Awaited<ReturnType<typeof findWidget>>>;

async function findWidget(publicId: string) {
  return prismaUnscoped.widgetInstallation.findUnique({
    where: { publicId },
    include: { tenant: { select: { id: true, name: true, status: true } } },
  });
}

function widgetFrom(res: Response): PublicWidget {
  return res.locals.widget as PublicWidget;
}

publicWidgetRouter.use("/:publicId", async (req, res, next) => {
  if (!/^diya_[\w-]{8,80}$/.test(req.params.publicId)) {
    res.status(404).json({ error: "Widget not found" });
    return;
  }
  const widget = await findWidget(req.params.publicId);
  if (!widget || !widget.enabled || widget.tenant.status !== "ACTIVE") {
    res.status(404).json({ error: "Widget not found" });
    return;
  }

  const origin = req.get("origin");
  if (!isAllowedOrigin(origin, widget.allowedOrigins)) {
    res.status(403).json({ error: "This website is not allowed to use the widget" });
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", origin!);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
  res.setHeader("Vary", "Origin");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  res.locals.widget = widget;
  next();
});

publicWidgetRouter.get("/:publicId", (_req, res) => {
  const widget = widgetFrom(res);
  res.json({
    brandName: widget.tenant.name,
    accentColor: widget.accentColor,
    welcomeText: widget.welcomeText,
  });
});

publicWidgetRouter.post("/:publicId/enquiries", async (req, res) => {
  const widget = widgetFrom(res);
  const contentLength = Number(req.get("content-length") ?? 0);
  if (contentLength > 24 * 1024) {
    res.status(413).json({ error: "Enquiry is too large" });
    return;
  }
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  if (typeof body.website === "string" && body.website.trim()) {
    res.status(202).json({ accepted: true });
    return;
  }

  const validated = validatePublicEnquiry(body);
  if (!validated.input) {
    res.status(400).json({ error: validated.error ?? "Invalid enquiry" });
    return;
  }

  if (!limiter.allow(`${widget.id}:${req.ip}`)) {
    res.status(429).json({ error: "Please wait a moment before sending another enquiry" });
    return;
  }

  const input = validated.input;
  if (input.pageUrl && new URL(input.pageUrl).origin !== req.get("origin")) {
    res.status(400).json({ error: "Page context must come from the configured website" });
    return;
  }
  await prisma.enquiry.upsert({
    where: { tenantId_submissionId: { tenantId: widget.tenantId, submissionId: input.submissionId }, tenantId: widget.tenantId },
    create: {
      tenantId: widget.tenantId,
      widgetInstallationId: widget.id,
      ...input,
      contactConsentAt: new Date(),
    },
    update: {},
    select: { id: true },
  });

  res.status(202).json({ accepted: true });
});
