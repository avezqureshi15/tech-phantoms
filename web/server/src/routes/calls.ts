import { Router, type Request } from "express";
import { prisma } from "../db/prisma";
import { getFlagsForTenant } from "../flags/client";
import { getPublicBaseUrl, isWithinIndiaCallWindow, normalizeE164, publicUrl, publicUrlIfConfigured } from "../call/guards";
import { TwilioCallChannel } from "../call/twilio";
import { isExplicitCustomerConfirmation } from "../outcome/classifier";
import { triggerHumanReviewWorkflow } from "../nudgebee/trigger";
import { mapTwilioCallError } from "../call/errors";
import { recordAudit } from "../auth/audit";

export const callsRouter = Router();

function tenantId(req: Request): string {
  return req.auth!.tenant!.id;
}

function actorName(req: Request): string {
  return req.auth!.user.name || req.auth!.user.email;
}

function callDurationLimit(): number {
  const value = Number(process.env.MAX_CALL_DURATION_SEC ?? 180);
  return Number.isFinite(value) ? Math.max(30, Math.min(600, Math.floor(value))) : 180;
}

function callableCategories(): Set<string> {
  return new Set((process.env.CALLABLE_QUERY_CATEGORIES ?? "")
    .split(",")
    .map((category) => category.trim())
    .filter(Boolean));
}

callsRouter.get("/", async (req, res) => {
  const calls = await prisma.callSession.findMany({
    where: { tenantId: tenantId(req) },
    orderBy: { startedAt: "desc" },
    take: 100,
    include: {
      query: { select: { id: true, issueSummary: true, status: true, orderId: true } },
      turns: { orderBy: { idx: "asc" } },
      outcome: true,
    },
  });
  res.json({ calls });
});

callsRouter.post("/", async (req, res) => {
  const tenant = req.auth!.tenant!;
  if (process.env.OUTBOUND_CALLING_ENABLED !== "true") {
    res.status(503).json({ error: "outbound calling is disabled" });
    return;
  }
  if (!getPublicBaseUrl()) {
    res.status(503).json({ error: "PUBLIC_BASE_URL must be configured as a public HTTPS URL" });
    return;
  }
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    res.status(503).json({ error: "Twilio credentials and caller number are not configured" });
    return;
  }
  const fromNumber = normalizeE164(process.env.TWILIO_PHONE_NUMBER);
  if (!fromNumber) {
    res.status(503).json({ error: "TWILIO_PHONE_NUMBER must be an E.164 number" });
    return;
  }
  if (!isWithinIndiaCallWindow(new Date())) {
    res.status(403).json({ error: "outbound calls are allowed only from 09:00 to 21:00 India time" });
    return;
  }

  const queryId = typeof req.body?.queryId === "string" ? req.body.queryId : "";
  if (!queryId) {
    res.status(400).json({ error: "queryId is required" });
    return;
  }

  const query = await prisma.query.findFirst({
    where: { id: queryId, tenantId: tenant.id },
    include: { customer: true, tenant: true },
  });
  if (!query) {
    res.status(404).json({ error: "query not found" });
    return;
  }
  if (!query.customer.outboundConsentAt || !query.customer.outboundConsentSource?.trim() || query.customer.doNotCall) {
    res.status(403).json({ error: "customer has not given valid outbound-call consent" });
    return;
  }
  const toNumber = normalizeE164(query.customer.phone);
  if (!toNumber) {
    res.status(422).json({ error: "customer phone number is not in E.164 format" });
    return;
  }
  if (!callableCategories().has(query.category)) {
    res.status(403).json({ error: "this query category is not enabled for outbound calling" });
    return;
  }

  const flags = await getFlagsForTenant(query.tenant.slug);
  if (!flags.ai_agent_enabled) {
    res.status(403).json({ error: "AI agent is disabled for this tenant" });
    return;
  }

  let callSession;
  try {
    callSession = await prisma.$transaction(async (tx) => {
      const activeCalls = await tx.callSession.count({
        where: { tenantId: tenant.id, state: { in: ["DIALING", "RINGING", "CONNECTED", "WRAPPING_UP"] } },
      });
      if (activeCalls >= 4) throw new Error("outbound concurrency limit reached");

      const claimed = await tx.query.updateMany({
        where: { id: query.id, tenantId: tenant.id, status: { in: ["NEW", "ONGOING", "FAILED", "HUMAN_REVIEW"] } },
        data: { status: "CALLING", attempts: { increment: 1 } },
      });
      if (claimed.count !== 1) throw new Error("query is already being called or is no longer callable");

      const ticket = await tx.ticket.create({
        data: {
          tenantId: tenant.id,
          customerId: query.customerId,
          orderId: query.orderId,
          channel: "VOICE",
          language: query.customer.preferredLang,
          status: "OPEN",
          issueCluster: query.category,
        },
      });
      const session = await tx.callSession.create({
        data: {
          tenantId: tenant.id,
          queryId: query.id,
          ticketId: ticket.id,
          channel: "TWILIO",
          toNumber,
          fromNumber,
        },
      });
      await tx.query.update({ where: { id: query.id, tenantId: tenant.id }, data: { lastCallId: session.id } });
      return session;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "could not reserve call";
    const status = message.includes("already being called") || message.includes("concurrency limit") ? 409 : 500;
    res.status(status).json({ error: status === 409 ? message : "could not reserve outbound call" });
    return;
  }

  try {
    const channel = new TwilioCallChannel();
    const { providerSid } = await channel.place({
      to: toNumber,
      from: fromNumber,
      voiceUrl: publicUrl(`/api/twilio/voice/${callSession.id}`),
      statusCallbackUrl: publicUrl(`/api/twilio/status/${callSession.id}`),
      timeLimitSeconds: callDurationLimit(),
    });
    await prisma.callSession.update({ where: { id: callSession.id, tenantId: tenant.id }, data: { providerSid } });
    await recordAudit({
      actorUserId: req.auth!.user.id,
      tenantId: tenant.id,
      action: "call.place",
      targetType: "CallSession",
      targetId: callSession.id,
      metadata: { queryId: query.id },
      ip: req.ip,
    });
    res.status(201).json({ callSessionId: callSession.id, queryId: query.id, state: "DIALING" });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
    const errorMessage = mapTwilioCallError(code);
    await prisma.$transaction([
      prisma.callSession.update({
        where: { id: callSession.id, tenantId: tenant.id },
        data: { state: "FAILED", endedAt: new Date(), errorCode: code, errorMessage },
      }),
      prisma.query.update({ where: { id: query.id, tenantId: tenant.id }, data: { status: "FAILED" } }),
      prisma.ticket.update({ where: { id: callSession.ticketId, tenantId: tenant.id }, data: { status: "ESCALATED", resolvedAt: new Date() } }),
    ]);
    console.error("Twilio call placement failed", { callSessionId: callSession.id, code });
    res.status(502).json({ error: errorMessage, twilioCode: code, callSessionId: callSession.id });
  }
});

callsRouter.get("/:id", async (req, res) => {
  const call = await prisma.callSession.findFirst({
    where: { id: req.params.id, tenantId: tenantId(req) },
    include: {
      query: { include: { customer: { select: { name: true } }, product: true } },
      turns: { orderBy: { idx: "asc" } },
      outcome: true,
      actions: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!call) {
    res.status(404).json({ error: "call not found" });
    return;
  }
  res.json({ call });
});

callsRouter.post("/:id/end", async (req, res) => {
  const tenant = tenantId(req);
  const call = await prisma.callSession.findFirst({ where: { id: req.params.id, tenantId: tenant } });
  if (!call) {
    res.status(404).json({ error: "call not found" });
    return;
  }
  if (call.state === "ENDED" || call.state === "FAILED") {
    res.json({ callSessionId: call.id, state: call.state, alreadyEnded: true });
    return;
  }
  if (!call.providerSid) {
    res.status(409).json({ error: "call provider has not assigned a call id yet" });
    return;
  }

  try {
    await new TwilioCallChannel().end(call.providerSid);
    await recordAudit({
      actorUserId: req.auth!.user.id,
      tenantId: tenant,
      action: "call.end",
      targetType: "CallSession",
      targetId: call.id,
      ip: req.ip,
    });
    res.json({ callSessionId: call.id, state: "WRAPPING_UP" });
  } catch {
    res.status(502).json({ error: "Twilio could not end the call" });
  }
});

callsRouter.patch("/:id/outcome", async (req, res) => {
  const tenant = tenantId(req);
  const outcome = req.body?.outcome;
  const evidence = typeof req.body?.evidence === "string" ? req.body.evidence.trim() : "";
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 500) : "";
  if (!["RESOLVED", "ONGOING", "HUMAN_REVIEW"].includes(outcome)) {
    res.status(400).json({ error: "outcome must be RESOLVED, ONGOING, or HUMAN_REVIEW" });
    return;
  }
  if (outcome !== "HUMAN_REVIEW" && !evidence) {
    res.status(400).json({ error: "a transcript quote is required for an optimistic outcome" });
    return;
  }
  const session = await prisma.callSession.findFirst({
    where: { id: req.params.id, tenantId: tenant },
    include: { query: { include: { customer: true } }, tenant: true },
  });
  if (!session) {
    res.status(404).json({ error: "call not found" });
    return;
  }
  if (!["ENDED", "FAILED"].includes(session.state)) {
    res.status(409).json({ error: "outcome can only be changed after the call has ended" });
    return;
  }
  const turns = await prisma.callTurn.findMany({ where: { callSessionId: session.id, tenantId: tenant }, orderBy: { idx: "asc" } });
  const transcript = turns.map((turn) => `${turn.role === "CUSTOMER" ? "CUSTOMER" : "AGENT"}: ${turn.text}`).join("\n");
  if (evidence && !transcript.includes(evidence)) {
    res.status(400).json({ error: "evidence must be a verbatim transcript quote" });
    return;
  }
  const isCustomerEvidence = turns.some((turn) => turn.role === "CUSTOMER" && turn.text.includes(evidence));
  if (outcome === "RESOLVED" && (!isCustomerEvidence || !isExplicitCustomerConfirmation(evidence))) {
    res.status(400).json({ error: "RESOLVED requires an explicit customer confirmation quote" });
    return;
  }

  const confidence = evidence ? "HIGH" as const : "LOW" as const;
  const actor = actorName(req);
  const rationale = note || `Outcome manually set by ${actor}.`;
  const updated = await prisma.callOutcome.upsert({
    where: { callSessionId: session.id, tenantId: tenant },
    create: {
      tenantId: tenant,
      callSessionId: session.id,
      actorUserId: req.auth!.user.id,
      value: outcome,
      confidence,
      evidence,
      rationale,
      overriddenBy: actor,
      overrideNote: note || null,
    },
    update: {
      actorUserId: req.auth!.user.id,
      value: outcome,
      confidence,
      evidence,
      rationale,
      overriddenBy: actor,
      overrideNote: note || null,
    },
  });
  const status = outcome === "RESOLVED"
    ? { query: "RESOLVED" as const, ticket: "AUTO_RESOLVED" as const, resolvedAt: new Date() }
    : outcome === "ONGOING"
      ? { query: "ONGOING" as const, ticket: "OPEN" as const, resolvedAt: null }
      : { query: "HUMAN_REVIEW" as const, ticket: "ESCALATED" as const, resolvedAt: new Date() };
  await prisma.$transaction([
    prisma.query.update({ where: { id: session.queryId, tenantId: tenant }, data: { status: status.query } }),
    prisma.ticket.update({ where: { id: session.ticketId, tenantId: tenant }, data: { status: status.ticket, resolvedAt: status.resolvedAt } }),
  ]);

  await recordAudit({
    actorUserId: req.auth!.user.id,
    tenantId: tenant,
    action: "call.outcome_override",
    targetType: "CallOutcome",
    targetId: updated.id,
    metadata: { outcome, callSessionId: session.id },
    ip: req.ip,
  });

  if (outcome === "HUMAN_REVIEW") {
    void triggerHumanReviewWorkflow({
      event: "HUMAN_REVIEW",
      callSessionId: session.id,
      queryId: session.queryId,
      tenantSlug: session.tenant.slug,
      orderId: session.query.orderId,
      customerName: session.query.customer.name,
      evidence,
      rationale,
      transcriptUrl: publicUrlIfConfigured(`/api/calls/${session.id}`),
    });
  }
  res.json({ outcome: updated });
});
