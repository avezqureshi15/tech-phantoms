import type { ResolvedFlags } from "@/lib/types";

/** Read-only flag mirror panel in the console header (§3.5). */
export function FlagMirror({ flags }: { flags: ResolvedFlags | null }) {
  if (!flags) return null;

  return (
    <div className="flex flex-wrap gap-2 text-xs text-tertiary">
      <span className="rounded-full border border-border bg-card px-3 py-1.5 shadow-sm">Agent <strong className="font-medium text-ink">{flags.ai_agent_enabled ? "On" : "Off"}</strong></span>
      <span className="rounded-full border border-border bg-card px-3 py-1.5 shadow-sm">Auto-refund <strong className="font-medium text-ink">≤ ₹{flags.auto_refund_limit_inr}</strong></span>
      <span className="rounded-full border border-border bg-card px-3 py-1.5 shadow-sm">Human approval <strong className="font-medium text-ink">&gt; ₹{flags.human_approval_above_inr}</strong></span>
      {flags.festive_surge_mode && <span className="rounded-full border border-status-warning/25 bg-status-warning-bg px-3 py-1.5 font-medium text-status-warning">Surge mode</span>}
    </div>
  );
}
