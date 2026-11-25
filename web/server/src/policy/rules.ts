/**
 * Hard rules (BUILD-PLAN §3.2, §5.4). Never flag-controlled — flags only move
 * the money ceiling within these bounds. Each returns a deny reason, or null
 * if the rule passes.
 */

const MAX_ORDER_AGE_DAYS = 7;

export interface OrderForPolicy {
  tenantId: string;
  placedAt: Date;
  refundedInr: number;
  amountInr: number;
}

export function checkOrderIdInContext(orderId: string, contextOrderIds: string[]): string | null {
  if (!contextOrderIds.includes(orderId)) {
    return "order was not one of the orders injected into this ticket's context";
  }
  return null;
}

export function checkOrderExists(order: OrderForPolicy | null): string | null {
  if (!order) {
    return "order not found";
  }
  return null;
}

export function checkTenantOwnership(order: OrderForPolicy, tenantId: string): string | null {
  if (order.tenantId !== tenantId) {
    return "order does not belong to this tenant";
  }
  return null;
}

export function checkOrderAge(order: OrderForPolicy, now: Date = new Date()): string | null {
  const ageMs = now.getTime() - order.placedAt.getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  if (ageDays >= MAX_ORDER_AGE_DAYS) {
    return `order is older than ${MAX_ORDER_AGE_DAYS} days`;
  }
  return null;
}

export function checkNotAlreadyRefunded(order: OrderForPolicy): string | null {
  if (order.refundedInr > 0) {
    return "order has already been refunded";
  }
  return null;
}

export function checkAmountPositive(amountInr: number): string | null {
  if (!(amountInr > 0)) {
    return "refund amount must be greater than zero";
  }
  return null;
}

export function checkAmountWithinOrderValue(order: OrderForPolicy, amountInr: number): string | null {
  if (amountInr > order.amountInr) {
    return `refund amount ₹${amountInr} exceeds the order's value of ₹${order.amountInr}`;
  }
  return null;
}
