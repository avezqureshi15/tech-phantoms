import type { Order } from "../generated/prisma";

/**
 * The integration seam (BUILD-PLAN §1.1, §5.6). Tools never talk to Prisma
 * directly — they call a CommerceAdapter. Today every tenant uses MockAdapter,
 * reading our own seeded Postgres. In production a tenant's adapter would be
 * "webhook": the same three methods, calling the brand's own REST API instead.
 */
export interface RefundResult {
  ok: boolean;
  refundedInr?: number;
  newStatus?: string;
  reason?: string;
}

export interface CommerceAdapter {
  getOrders(customerId: string): Promise<Order[]>;
  getOrder(orderId: string): Promise<Order | null>;
  issueRefund(orderId: string, amountInr: number, reason: string): Promise<RefundResult>;
}
