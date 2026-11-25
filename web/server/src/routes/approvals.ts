import { Router } from "express";
import { prisma, prismaUnscoped } from "../db/prisma";
import { scoped } from "../db/scoped";
import { adapterFor } from "../adapters";
import type { Prisma } from "../generated/prisma";

export const approvalsRouter = Router();

interface ApprovalCallbackBody {
  approvalId?: string;
  decision?: "APPROVED" | "REJECTED";
  approver?: string;
  secret?: string;
}

/**
 * NudgeBee calls back in here (§3.4, §7.1). Verifies the shared secret,
 * requires the approval to still be PENDING, and is idempotent — a replayed
 * callback must not refund twice (§7.3).
 */
approvalsRouter.post("/callback", async (req, res) => {
  const body = req.body as ApprovalCallbackBody;
  const { approvalId, decision, approver, secret } = body;

  const expectedSecret = process.env.APPROVAL_CALLBACK_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    res.status(403).json({ ok: false, error: "invalid secret" });
    return;
  }

  if (!approvalId || (decision !== "APPROVED" && decision !== "REJECTED")) {
    res.status(400).json({ ok: false, error: "approvalId and a valid decision are required" });
    return;
  }

  // The callback only carries an opaque approvalId — tenantId isn't known
  // until we look it up. The shared secret is the security boundary here.
  const approval = await prismaUnscoped.approval.findUnique({ where: { id: approvalId } });
  if (!approval) {
    res.status(404).json({ ok: false, error: "approval not found" });
    return;
  }

  if (approval.status !== "PENDING") {
    res.json({ ok: true, alreadyProcessed: true });
    return;
  }

  const db = scoped(approval.tenantId);

  if (decision === "REJECTED") {
    await db.approval.update(approval.id, {
      status: "REJECTED",
      approver,
      decidedAt: new Date(),
    });
    await db.ticket.update(approval.ticketId, {
      status: "ESCALATED",
      resolvedAt: new Date(),
    });
    res.json({ ok: true });
    return;
  }

  // APPROVED — execute the refund now.
  const agentAction = await prismaUnscoped.agentAction.findUnique({ where: { id: approval.agentActionId } });
  const tenant = await prisma.tenant.findUnique({ where: { id: approval.tenantId } });

  if (!agentAction || !tenant) {
    res.status(500).json({ ok: false, error: "approval is missing its action or tenant" });
    return;
  }

  const args = agentAction.args as { orderId: string; amountInr: number; reason: string };
  const adapter = adapterFor(tenant);
  const refundResult = await adapter.issueRefund(args.orderId, args.amountInr, args.reason);

  await db.approval.update(approval.id, {
    status: "APPROVED",
    approver,
    decidedAt: new Date(),
  });

  await prisma.agentAction.update({
    where: { id: agentAction.id, tenantId: approval.tenantId },
    data: {
      executed: refundResult.ok,
      result: refundResult as unknown as Prisma.InputJsonValue,
    },
  });

  await db.ticket.update(approval.ticketId, {
    status: refundResult.ok ? "AUTO_RESOLVED" : "ESCALATED",
    resolvedAt: new Date(),
  });

  res.json({ ok: true, refund: refundResult });
});
