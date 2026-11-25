import { CircleCheck, CircleHelp, CirclePause, CircleX } from "lucide-react";
import type { AgentActionSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The visual payoff of the demo (§3.7) — never bury the outcome in agent text. */
export function ActionCard({ action }: { action: AgentActionSummary | null }) {
  if (!action) return null;

  const { variant, title, subtitle } = describeAction(action);

  const accentClasses: Record<typeof variant, string> = {
    success: "border-l-status-success",
    warning: "border-l-status-warning",
    danger: "border-l-status-danger",
    neutral: "border-l-status-neutral",
  };
  const iconClasses: Record<typeof variant, string> = {
    success: "text-status-success",
    warning: "text-status-warning",
    danger: "text-status-danger",
    neutral: "text-status-neutral",
  };
  const Icon = { success: CircleCheck, warning: CirclePause, danger: CircleX, neutral: CircleHelp }[variant];

  return (
    <div
      className={cn(
        "rounded-2xl border border-border border-l-[3px] bg-card px-5 py-4 text-left shadow-sm",
        accentClasses[variant],
      )}
      role="status"
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 size-5 shrink-0", iconClasses[variant])} aria-hidden="true" />
        <div>
          <p className="font-heading text-base font-medium tracking-tight text-ink">{title}</p>
          <p className="mt-1 text-sm text-tertiary">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

type Variant = "success" | "warning" | "danger" | "neutral";

function describeAction(action: AgentActionSummary): { variant: Variant; title: string; subtitle: string } {
  const orderId = typeof action.args.orderId === "string" ? action.args.orderId : undefined;
  const amountInr = typeof action.args.amountInr === "number" ? action.args.amountInr : undefined;

  if (action.tool === "escalate_to_human") {
    return { variant: "neutral", title: "Escalated to a human agent", subtitle: String(action.args.summary ?? "") };
  }

  if (action.tool === "issue_refund") {
    if (action.policyDecision === "ALLOW" && action.executed) {
      return {
        variant: "success",
        title: `Refund issued ₹${amountInr ?? "?"}`,
        subtitle: `${orderId ?? ""} · auto-approved`,
      };
    }
    if (action.policyDecision === "REQUIRE_HUMAN") {
      return {
        variant: "warning",
        title: `Sent for approval ₹${amountInr ?? "?"}`,
        subtitle: `${orderId ?? ""} · ${action.denyReason ?? "waiting on ops"}`,
      };
    }
    return {
      variant: "danger",
      title: "Refund denied",
      subtitle: action.denyReason ?? "policy denied this refund",
    };
  }

  if (action.tool === "get_order_status") {
    return {
      variant: action.policyDecision === "ALLOW" ? "neutral" : "danger",
      title: action.policyDecision === "ALLOW" ? "Order looked up" : "Lookup denied",
      subtitle: `${orderId ?? ""} ${action.denyReason ?? ""}`.trim(),
    };
  }

  return { variant: "neutral", title: action.tool, subtitle: action.denyReason ?? "" };
}
