import { Router, type Request } from "express";
import { prisma, prismaUnscoped } from "../db/prisma";
import { recordAudit } from "../auth/audit";
import { CATEGORY, CONSENT_SOURCE, parseSupportRequest, verifySignature } from "../integrations/festiveos";

/**
 * Machine-to-machine entry for the FestiveOS mobile backend. Not behind the console login: it is
 * protected by an HMAC signature over the exact body and a five-minute window instead.
 * Mounted at /api/integrations (see app.ts).
 */
export const integrationsRouter = Router();

type RawBodyRequest = Request & { rawBody?: Buffer };

integrationsRouter.post("/support-requests", async (req: RawBodyRequest, res) => {
  const secret = process.env.INTEGRATION_SECRET;
  if (!secret) {
    res.status(503).json({ error: "integration is not configured" });
    return;
  }
  const check = verifySignature({
    secret,
    timestamp: req.header("x-festiveos-timestamp"),
    signature: req.header("x-festiveos-signature"),
    rawBody: req.rawBody,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (check !== "ok") {
    // The same answer for every failure, so it says nothing useful to someone guessing.
    res.status(401).json({ error: "invalid signature" });
    return;
  }

  const parsed = parseSupportRequest(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const request = parsed.value;

  const slug = process.env.INTEGRATION_TENANT_SLUG ?? "festiveos";
  const tenant = await prismaUnscoped.tenant.findFirst({ where: { slug, status: "ACTIVE" }, select: { id: true } });
  if (!tenant) {
    res.status(503).json({ error: "integration tenant is not available" });
    return;
  }

  const existing = await prisma.customer.findFirst({ where: { tenantId: tenant.id, phone: request.phone } });
  // A "do not call" is a person's earlier choice. Only a staff decision lifts it, never a new request.
  if (existing?.doNotCall) {
    res.status(200).json({ status: "do_not_call" });
    return;
  }

  const customerData = {
    name: request.name,
    preferredLang: request.preferredLang,
    outboundConsentAt: request.consentAt,
    outboundConsentSource: CONSENT_SOURCE,
  };
  const customer = existing
    ? await prisma.customer.update({ where: { id: existing.id }, data: customerData })
    : await prisma.customer.create({ data: { tenantId: tenant.id, phone: request.phone, ...customerData } });

  // The same requestId is never turned into a second query, so a retry after a timeout is safe.
  const ref = `[ref:${request.requestId}]`;
  const duplicate = await prisma.query.findFirst({
    where: { tenantId: tenant.id, customerId: customer.id, category: CATEGORY, issueSummary: { contains: ref } },
    select: { id: true },
  });
  if (duplicate) {
    res.status(200).json({ status: "duplicate", queryId: duplicate.id });
    return;
  }

  const query = await prisma.query.create({
    data: {
      tenantId: tenant.id,
      customerId: customer.id,
      category: CATEGORY,
      issueSummary: `${request.issueSummary} ${ref}`,
      priority: "NORMAL",
      status: "NEW",
    },
    select: { id: true },
  });
  await recordAudit({
    actorUserId: null,
    tenantId: tenant.id,
    action: "customer.consent_record",
    targetType: "Customer",
    targetId: customer.id,
    metadata: { queryId: query.id, source: CONSENT_SOURCE, version: request.consentVersion },
    ip: req.ip,
  });
  res.status(201).json({ status: "created", queryId: query.id });
});
