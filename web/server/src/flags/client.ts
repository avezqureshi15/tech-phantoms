import { Flagsmith, DefaultFlag } from "@flagsmith/nodejs";
import { FLAG_KEYS, FLAG_DEFAULTS } from "./keys";

export interface ResolvedFlags {
  ai_agent_enabled: boolean;
  auto_refund_limit_inr: number;
  human_approval_above_inr: number;
  festive_surge_mode: boolean;
  enabled_languages: string;
  agent_prompt_variant: string;
}

// §6: evaluated server-side only. A client-evaluated flag controlling refund
// limits would be a security hole.
const CACHE_TTL_MS = 5000;

function defaultFlagHandler(featureName: string): DefaultFlag {
  const fallback = (FLAG_DEFAULTS as Record<string, unknown>)[featureName];
  if (typeof fallback === "boolean") {
    return new DefaultFlag(fallback, fallback);
  }
  if (fallback !== undefined) {
    return new DefaultFlag(fallback as string | number, true);
  }
  return new DefaultFlag(null, false);
}

let client: Flagsmith | null | undefined;

/** Lazily created so a missing key doesn't crash the server at import time. */
function getClient(): Flagsmith | null {
  if (client !== undefined) return client;

  const environmentKey = process.env.FLAGSMITH_SERVER_KEY;
  client = environmentKey ? new Flagsmith({ environmentKey, defaultFlagHandler }) : null;
  return client;
}

const cache = new Map<string, { flags: ResolvedFlags; expiresAt: number }>();

/**
 * Resolved flags for a tenant, identified as `tenant:<slug>` (§6 per-tenant
 * targeting). Falls back to §6 defaults if Flagsmith has no key configured
 * or is unreachable — local dev and a Flagsmith outage both fail open.
 */
export async function getFlagsForTenant(tenantSlug: string): Promise<ResolvedFlags> {
  const cached = cache.get(tenantSlug);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.flags;
  }

  const flags = await resolveFlags(tenantSlug);
  cache.set(tenantSlug, { flags, expiresAt: Date.now() + CACHE_TTL_MS });
  return flags;
}

async function resolveFlags(tenantSlug: string): Promise<ResolvedFlags> {
  const fsClient = getClient();
  if (!fsClient) {
    return { ...FLAG_DEFAULTS };
  }

  try {
    const flags = await fsClient.getIdentityFlags(`tenant:${tenantSlug}`);
    return {
      ai_agent_enabled: flags.isFeatureEnabled(FLAG_KEYS.aiAgentEnabled),
      auto_refund_limit_inr: Number(
        flags.getFeatureValue(FLAG_KEYS.autoRefundLimitInr) ?? FLAG_DEFAULTS.auto_refund_limit_inr,
      ),
      human_approval_above_inr: Number(
        flags.getFeatureValue(FLAG_KEYS.humanApprovalAboveInr) ?? FLAG_DEFAULTS.human_approval_above_inr,
      ),
      festive_surge_mode: flags.isFeatureEnabled(FLAG_KEYS.festiveSurgeMode),
      enabled_languages: String(
        flags.getFeatureValue(FLAG_KEYS.enabledLanguages) ?? FLAG_DEFAULTS.enabled_languages,
      ),
      agent_prompt_variant: String(
        flags.getFeatureValue(FLAG_KEYS.agentPromptVariant) ?? FLAG_DEFAULTS.agent_prompt_variant,
      ),
    };
  } catch (err) {
    console.error(`Flagsmith fetch failed for tenant ${tenantSlug}, using defaults:`, err);
    return { ...FLAG_DEFAULTS };
  }
}
