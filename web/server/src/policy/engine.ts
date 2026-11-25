import {
  checkAmountPositive,
  checkAmountWithinOrderValue,
  checkNotAlreadyRefunded,
  checkOrderAge,
  checkOrderExists,
  checkOrderIdInContext,
  checkTenantOwnership,
  type OrderForPolicy,
} from "./rules";

export type PolicyDecision = "ALLOW" | "DENY" | "REQUIRE_HUMAN";

export interface PolicyVerdict {
  decision: PolicyDecision;
  reason?: string;
}

/** The exact flag values a decision was made against (BUILD-PLAN §6) — snapshot this onto AgentAction. */
export interface FlagSnapshot {
  ai_agent_enabled: boolean;
  auto_refund_limit_inr: number;
  human_approval_above_inr: number;
  festive_surge_mode: boolean;
}

// Not specified exactly in BUILD-PLAN §6 beyond "raises limits" — a 1.5x multiplier
// while festive_surge_mode is on, applied only to the auto-approve ceiling.
const SURGE_MODE_MULTIPLIER = 1.5;

export interface RefundAuthorizationInput {
  tenantId: string;
  orderId: string;
  amountInr: number;
  /** Order ids injected into this ticket's context (§5.4 disambiguation). */
  contextOrderIds: string[];
  order: OrderForPolicy | null;
  flags: FlagSnapshot;
}

/**
 * The policy engine (§3.2): hard rules + flags → ALLOW | DENY | REQUIRE_HUMAN.
 * Hard rules are never flag-controlled and fail closed as DENY. The kill
 * switch and the money ceilings are flag-controlled and fail open to a human.
 */
export function authoriseRefund(input: RefundAuthorizationInput): PolicyVerdict {
  const { tenantId, orderId, amountInr, contextOrderIds, order, flags } = input;

  const hardRuleFailure =
    checkOrderIdInContext(orderId, contextOrderIds) ??
    checkOrderExists(order) ??
    (order && checkTenantOwnership(order, tenantId)) ??
    (order && checkOrderAge(order)) ??
    (order && checkNotAlreadyRefunded(order)) ??
    checkAmountPositive(amountInr) ??
    (order && checkAmountWithinOrderValue(order, amountInr));

  if (hardRuleFailure) {
    return { decision: "DENY", reason: hardRuleFailure };
  }

  if (!flags.ai_agent_enabled) {
    return { decision: "REQUIRE_HUMAN", reason: "AI agent is disabled for this tenant" };
  }

  if (amountInr > flags.human_approval_above_inr) {
    return {
      decision: "REQUIRE_HUMAN",
      reason: `refund above ₹${flags.human_approval_above_inr} always needs human approval`,
    };
  }

  const effectiveAutoLimit = flags.festive_surge_mode
    ? Math.round(flags.auto_refund_limit_inr * SURGE_MODE_MULTIPLIER)
    : flags.auto_refund_limit_inr;

  if (amountInr > effectiveAutoLimit) {
    return {
      decision: "REQUIRE_HUMAN",
      reason: `refund above the ₹${effectiveAutoLimit} auto-approval limit`,
    };
  }

  return { decision: "ALLOW" };
}

export interface ReadAuthorizationInput {
  tenantId: string;
  orderId: string;
  contextOrderIds: string[];
  order: OrderForPolicy | null;
}

/** get_order_status is never REQUIRE_HUMAN — it's a read, gated only by tenant scope + context. */
export function authoriseGetOrderStatus(input: ReadAuthorizationInput): PolicyVerdict {
  const { tenantId, orderId, contextOrderIds, order } = input;

  const failure =
    checkOrderIdInContext(orderId, contextOrderIds) ??
    checkOrderExists(order) ??
    (order && checkTenantOwnership(order, tenantId));

  if (failure) {
    return { decision: "DENY", reason: failure };
  }

  return { decision: "ALLOW" };
}
