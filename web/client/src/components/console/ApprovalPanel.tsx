import { Link } from "react-router-dom";
import { CirclePause } from "lucide-react";
import type { Approval } from "@/lib/types";

function ageLabel(createdAt: string): string {
  const minutes = Math.round((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

/** Pending approvals panel, above the ticket feed (§3.5) — the live NudgeBee proof. */
export function ApprovalPanel({ approvals, tenantSlug }: { approvals: Approval[]; tenantSlug: string }) {
  if (approvals.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border border-l-[3px] border-l-status-warning bg-card p-5 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 font-heading text-sm font-medium text-ink">
        <CirclePause className="size-4 text-status-warning" aria-hidden="true" />
        Awaiting approval <span className="font-normal text-tertiary">({approvals.length})</span>
      </h2>
      <ul className="flex flex-col gap-2">
        {approvals.map((a) => {
          const args = a.agentAction?.args as { orderId?: string; amountInr?: number } | undefined;
          return (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
              <span className="text-ink">
                {args?.orderId ?? "order"} · ₹{args?.amountInr ?? "?"} · {a.ticket?.customer?.name ?? "customer"} ·{" "}
                <span className="text-tertiary">{ageLabel(a.createdAt)}</span>
              </span>
              <Link
                to={`/console/tickets/${a.ticketId}?tenantSlug=${tenantSlug}`}
                className="font-medium text-primary hover:underline hover:underline-offset-4"
              >
                View ticket
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
