import { scoped } from "../db/scoped";
import type { Order } from "../generated/prisma";
import type { CommerceAdapter, RefundResult } from "./types";

/** Reads/writes our own seeded Postgres. Today the only adapter we build. */
export class MockAdapter implements CommerceAdapter {
  constructor(private tenantId: string) {}

  async getOrders(customerId: string): Promise<Order[]> {
    const db = scoped(this.tenantId);
    return db.order.findMany({ where: { customerId } });
  }

  async getOrder(orderId: string): Promise<Order | null> {
    const db = scoped(this.tenantId);
    return db.order.findUnique(orderId);
  }

  async issueRefund(orderId: string, amountInr: number, reason: string): Promise<RefundResult> {
    void reason; // kept for interface parity; the agent layer logs it on AgentAction
    const db = scoped(this.tenantId);
    const order = await db.order.findUnique(orderId);
    if (!order) {
      return { ok: false, reason: "order not found" };
    }
    if (order.refundedInr > 0) {
      return { ok: false, reason: "already refunded" };
    }

    const updated = await db.order.update(orderId, {
      refundedInr: amountInr,
    });

    return { ok: true, refundedInr: updated.refundedInr, newStatus: updated.status };
  }
}
