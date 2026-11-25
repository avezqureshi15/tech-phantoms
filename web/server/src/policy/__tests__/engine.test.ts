import { describe, expect, it } from "vitest";
import { authoriseRefund, authoriseGetOrderStatus, type FlagSnapshot } from "../engine";
import type { OrderForPolicy } from "../rules";

const TENANT_ID = "tenant-1";
const ORDER_ID = "ORD-1001";

const DEFAULT_FLAGS: FlagSnapshot = {
  ai_agent_enabled: true,
  auto_refund_limit_inr: 2000,
  human_approval_above_inr: 5000,
  festive_surge_mode: false,
};

function freshOrder(overrides: Partial<OrderForPolicy> = {}): OrderForPolicy {
  return {
    tenantId: TENANT_ID,
    placedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days old
    refundedInr: 0,
    amountInr: 10000, // generous order value so other tests aren't constrained by it
    ...overrides,
  };
}

describe("authoriseRefund", () => {
  it("allows a ₹1,450 refund under the ₹2,000 auto limit (BUILD-PLAN G2)", () => {
    const verdict = authoriseRefund({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      amountInr: 1450,
      contextOrderIds: [ORDER_ID],
      order: freshOrder(),
      flags: DEFAULT_FLAGS,
    });
    expect(verdict.decision).toBe("ALLOW");
  });

  it("requires human approval for the ₹6,800 hamper, above the ceiling (BUILD-PLAN G2)", () => {
    const verdict = authoriseRefund({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      amountInr: 6800,
      contextOrderIds: [ORDER_ID],
      order: freshOrder(),
      flags: DEFAULT_FLAGS,
    });
    expect(verdict.decision).toBe("REQUIRE_HUMAN");
  });

  it("denies a refund for an orderId not injected into this ticket's context (§5.4 security rule)", () => {
    const verdict = authoriseRefund({
      tenantId: TENANT_ID,
      orderId: "ORD-9999",
      amountInr: 500,
      contextOrderIds: [ORDER_ID],
      order: freshOrder(),
      flags: DEFAULT_FLAGS,
    });
    expect(verdict.decision).toBe("DENY");
  });

  it("denies a refund on an order older than 7 days — never flag-controlled", () => {
    const verdict = authoriseRefund({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      amountInr: 500,
      contextOrderIds: [ORDER_ID],
      order: freshOrder({ placedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) }),
      flags: DEFAULT_FLAGS,
    });
    expect(verdict.decision).toBe("DENY");
    expect(verdict.reason).toMatch(/7 days/);
  });

  it("denies a double refund on an order that was already refunded", () => {
    const verdict = authoriseRefund({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      amountInr: 500,
      contextOrderIds: [ORDER_ID],
      order: freshOrder({ refundedInr: 500 }),
      flags: DEFAULT_FLAGS,
    });
    expect(verdict.decision).toBe("DENY");
  });

  it("routes to a human when the ai_agent_enabled kill switch is off, even for a small refund", () => {
    const verdict = authoriseRefund({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      amountInr: 100,
      contextOrderIds: [ORDER_ID],
      order: freshOrder(),
      flags: { ...DEFAULT_FLAGS, ai_agent_enabled: false },
    });
    expect(verdict.decision).toBe("REQUIRE_HUMAN");
  });

  it("raises the auto-approve ceiling under festive_surge_mode, without touching the hard human-approval ceiling", () => {
    const flags = { ...DEFAULT_FLAGS, festive_surge_mode: true }; // 2000 * 1.5 = 3000
    const underSurgedCeiling = authoriseRefund({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      amountInr: 2500,
      contextOrderIds: [ORDER_ID],
      order: freshOrder(),
      flags,
    });
    expect(underSurgedCeiling.decision).toBe("ALLOW");

    const aboveHumanCeiling = authoriseRefund({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      amountInr: 5500,
      contextOrderIds: [ORDER_ID],
      order: freshOrder(),
      flags,
    });
    expect(aboveHumanCeiling.decision).toBe("REQUIRE_HUMAN");
  });

  it("denies a refund amount greater than the order's own value", () => {
    const verdict = authoriseRefund({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      amountInr: 2000,
      contextOrderIds: [ORDER_ID],
      order: freshOrder({ amountInr: 500 }),
      flags: DEFAULT_FLAGS,
    });
    expect(verdict.decision).toBe("DENY");
    expect(verdict.reason).toMatch(/exceeds the order's value/);
  });

  it("denies a non-positive refund amount", () => {
    const verdict = authoriseRefund({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      amountInr: 0,
      contextOrderIds: [ORDER_ID],
      order: freshOrder(),
      flags: DEFAULT_FLAGS,
    });
    expect(verdict.decision).toBe("DENY");
  });
});

describe("authoriseGetOrderStatus", () => {
  it("allows reading an order that is in this ticket's context", () => {
    const verdict = authoriseGetOrderStatus({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      contextOrderIds: [ORDER_ID],
      order: freshOrder(),
    });
    expect(verdict.decision).toBe("ALLOW");
  });

  it("denies reading an order from a different tenant", () => {
    const verdict = authoriseGetOrderStatus({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      contextOrderIds: [ORDER_ID],
      order: freshOrder({ tenantId: "other-tenant" }),
    });
    expect(verdict.decision).toBe("DENY");
  });
});
