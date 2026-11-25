import { Router, type Request } from "express";
import { scoped } from "../db/scoped";
import { getFlagsForTenant } from "../flags/client";
import { listActiveMemberships } from "../auth/sessions";

export const consoleRouter = Router();

/** The active tenant is derived from the session by requireTenant. */
function tenantId(req: Request): string {
  return req.auth!.tenant!.id;
}

/** Ticket feed — polls every 2s from the console (§3.5). */
consoleRouter.get("/tickets", async (req, res) => {
  const since = typeof req.query.since === "string" ? new Date(req.query.since) : undefined;
  const db = scoped(tenantId(req));

  const tickets = await db.ticket.findMany({
    where: since ? { openedAt: { gte: since } } : undefined,
    orderBy: { openedAt: "desc" },
    take: 100,
    include: {
      customer: true,
      actions: { orderBy: { createdAt: "desc" }, take: 1 },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  res.json({ tickets });
});

/** Ticket detail — header, transcript, audit trail, flag snapshot, approval (§3.5). */
consoleRouter.get("/tickets/:id", async (req, res) => {
  const db = scoped(tenantId(req));
  const ticket = await db.ticket.findUnique(req.params.id, { include: { customer: true } });
  if (!ticket) {
    res.status(404).json({ error: "ticket not found" });
    return;
  }

  const [messages, actions, approvals] = await Promise.all([
    db.message.findMany(ticket.id),
    db.agentAction.findMany(ticket.id),
    db.approval.findMany({ where: { ticketId: ticket.id } }),
  ]);

  res.json({ ticket, messages, actions, approval: approvals[0] ?? null });
});

/** Four metric tiles (§3.5 formulas). */
consoleRouter.get("/metrics", async (req, res) => {
  const db = scoped(tenantId(req));
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [ticketsToday, resolvedTickets, awaitingApproval, resolvedWithTimes] = await Promise.all([
    db.ticket.findMany({ where: { openedAt: { gte: startOfToday } } }),
    db.ticket.findMany({ where: { status: { not: "OPEN" } } }),
    db.ticket.findMany({ where: { status: "AWAITING_APPROVAL" } }),
    db.ticket.findMany({ where: { resolvedAt: { not: null } } }),
  ]);

  const autoResolvedCount = resolvedTickets.filter((t) => t.status === "AUTO_RESOLVED").length;
  const autoResolvedPct = resolvedTickets.length > 0 ? (autoResolvedCount / resolvedTickets.length) * 100 : 0;

  const handleTimes = resolvedWithTimes
    .filter((t) => t.resolvedAt)
    .map((t) => (t.resolvedAt!.getTime() - t.openedAt.getTime()) / 1000);
  const avgHandleTimeSeconds =
    handleTimes.length > 0 ? handleTimes.reduce((a, b) => a + b, 0) / handleTimes.length : 0;

  res.json({
    ticketsToday: ticketsToday.length,
    autoResolvedPct: Math.round(autoResolvedPct),
    awaitingApproval: awaitingApproval.length,
    avgHandleTimeSeconds: Math.round(avgHandleTimeSeconds),
  });
});

/** Pending approvals panel (§3.5, §7.1). */
consoleRouter.get("/approvals", async (req, res) => {
  const db = scoped(tenantId(req));
  const approvals = await db.approval.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: { agentAction: true, ticket: { include: { customer: true } } },
  });

  res.json({ approvals });
});

/** Read-only flag mirror panel in the console header. */
consoleRouter.get("/flags", async (req, res) => {
  res.json(await getFlagsForTenant(req.auth!.tenant!.slug));
});

/** Only workspaces the signed-in user belongs to — never the global tenant list. */
consoleRouter.get("/tenants", async (req, res) => {
  const memberships = await listActiveMemberships(req.auth!.user.id);
  res.json({
    tenants: memberships.map((membership) => ({
      slug: membership.tenantSlug,
      name: membership.tenantName,
      role: membership.role,
    })),
  });
});

/** Customer picker on /demo. */
consoleRouter.get("/customers", async (req, res) => {
  const db = scoped(tenantId(req));
  const customers = await db.customer.findMany();
  res.json({ customers });
});
