import { Router, type Request } from "express";
import { prisma } from "../db/prisma";
import type { QueryStatus } from "../generated/prisma";
import { TwilioCallChannel } from "../call/twilio";
import { recordAudit } from "../auth/audit";

const QUERY_STATUSES: QueryStatus[] = ["NEW", "CALLING", "ONGOING", "RESOLVED", "HUMAN_REVIEW", "FAILED"];

export const queriesRouter = Router();

function tenantId(req: Request): string {
  return req.auth!.tenant!.id;
}

queriesRouter.get("/", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : undefined;
  if (status && !QUERY_STATUSES.includes(status as QueryStatus)) {
    res.status(400).json({ error: "invalid query status" });
    return;
  }
  const queries = await prisma.query.findMany({
    where: {
      tenantId: tenantId(req),
      ...(status ? { status: status as QueryStatus } : {}),
      ...(category ? { category } : {}),
      ...(q ? {
        OR: [
          { issueSummary: { contains: q, mode: "insensitive" } },
          { orderId: { contains: q, mode: "insensitive" } },
          { customer: { name: { contains: q, mode: "insensitive" } } },
        ],
      } : {}),
    },
    orderBy: [{ priority: "asc" }, { detectedAt: "desc" }],
    take: 200,
    include: {
      customer: { select: { id: true, name: true, phone: true, preferredLang: true, outboundConsentAt: true, doNotCall: true } },
      product: true,
      calls: { select: { id: true, state: true, startedAt: true, endedAt: true }, orderBy: { startedAt: "desc" }, take: 1 },
    },
  });
  res.json({ queries });
});

queriesRouter.get("/:id", async (req, res) => {
  const query = await prisma.query.findFirst({
    where: { id: req.params.id, tenantId: tenantId(req) },
    include: {
      customer: true,
      product: true,
      calls: { orderBy: { startedAt: "desc" }, include: { turns: { orderBy: { idx: "asc" } }, outcome: true } },
    },
  });
  if (!query) {
    res.status(404).json({ error: "query not found" });
    return;
  }
  res.json({ query });
});

queriesRouter.post("/:id/consent", async (req, res) => {
  const confirmation = req.body?.confirmed === true;
  const source = typeof req.body?.source === "string" ? req.body.source.trim() : "";
  if (!confirmation || source.length < 5 || source.length > 200) {
    res.status(400).json({ error: "confirmed=true and a consent source (5-200 chars) are required" });
    return;
  }
  const tenant = tenantId(req);
  const query = await prisma.query.findFirst({ where: { id: req.params.id, tenantId: tenant } });
  if (!query) {
    res.status(404).json({ error: "query not found" });
    return;
  }
  const updated = await prisma.customer.updateMany({
    where: { id: query.customerId, tenantId: tenant },
    data: { outboundConsentAt: new Date(), outboundConsentSource: source, doNotCall: false },
  });
  if (updated.count !== 1) {
    res.status(404).json({ error: "query not found" });
    return;
  }
  const customer = await prisma.customer.findFirst({
    where: { id: query.customerId, tenantId: tenant },
    select: { id: true, outboundConsentAt: true, outboundConsentSource: true, doNotCall: true },
  });
  await recordAudit({
    actorUserId: req.auth!.user.id,
    tenantId: tenant,
    action: "customer.consent_record",
    targetType: "Customer",
    targetId: query.customerId,
    metadata: { queryId: query.id },
    ip: req.ip,
  });
  if (req.body.doNotCall) {
    const activeCalls = await prisma.callSession.findMany({
      where: { queryId: query.id, tenantId: tenant, state: { in: ["DIALING", "RINGING", "CONNECTED"] }, providerSid: { not: null } },
      select: { providerSid: true },
    });
    await Promise.all(activeCalls.map(async ({ providerSid }) => {
      if (!providerSid) return;
      try {
        await new TwilioCallChannel().end(providerSid);
      } catch {
        console.error("Could not terminate active call after do-not-call request", { queryId: query.id });
      }
    }));
  }
  res.json({ customer });
});

queriesRouter.patch("/:id/do-not-call", async (req, res) => {
  if (typeof req.body?.doNotCall !== "boolean") {
    res.status(400).json({ error: "doNotCall must be a boolean" });
    return;
  }
  const tenant = tenantId(req);
  const query = await prisma.query.findFirst({ where: { id: req.params.id, tenantId: tenant } });
  if (!query) {
    res.status(404).json({ error: "query not found" });
    return;
  }
  const updated = await prisma.customer.updateMany({
    where: { id: query.customerId, tenantId: tenant },
    data: { doNotCall: req.body.doNotCall },
  });
  if (updated.count !== 1) {
    res.status(404).json({ error: "query not found" });
    return;
  }
  const customer = await prisma.customer.findFirst({
    where: { id: query.customerId, tenantId: tenant },
    select: { id: true, outboundConsentAt: true, doNotCall: true },
  });
  await recordAudit({
    actorUserId: req.auth!.user.id,
    tenantId: tenant,
    action: req.body.doNotCall ? "customer.do_not_call" : "customer.do_not_call_clear",
    targetType: "Customer",
    targetId: query.customerId,
    metadata: { queryId: query.id },
    ip: req.ip,
  });
  res.json({ customer });
});
