/** Typed flag accessors (BUILD-PLAN §6) — no magic strings elsewhere. */

export const FLAG_KEYS = {
  aiAgentEnabled: "ai_agent_enabled",
  autoRefundLimitInr: "auto_refund_limit_inr",
  humanApprovalAboveInr: "human_approval_above_inr",
  festiveSurgeMode: "festive_surge_mode",
  enabledLanguages: "enabled_languages",
  agentPromptVariant: "agent_prompt_variant",
} as const;

/** Defaults from §6 — used when Flagsmith is unreachable or has no override for a flag. */
export const FLAG_DEFAULTS = {
  [FLAG_KEYS.aiAgentEnabled]: true,
  [FLAG_KEYS.autoRefundLimitInr]: 2000,
  [FLAG_KEYS.humanApprovalAboveInr]: 5000,
  [FLAG_KEYS.festiveSurgeMode]: false,
  [FLAG_KEYS.enabledLanguages]: "hi,en,kn,ta",
  [FLAG_KEYS.agentPromptVariant]: "A",
};
