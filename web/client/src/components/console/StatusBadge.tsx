import { Badge } from "@/components/ui/badge";
import type { TicketStatus } from "@/lib/types";

const STATUS_STYLES: Record<TicketStatus, { label: string; className: string }> = {
  AUTO_RESOLVED: { label: "Auto-resolved", className: "border-status-success/25 bg-status-success-bg text-status-success" },
  AWAITING_APPROVAL: { label: "Awaiting approval", className: "border-status-warning/25 bg-status-warning-bg text-status-warning" },
  ESCALATED: { label: "Escalated", className: "border-status-danger/25 bg-status-danger-bg text-status-danger" },
  OPEN: { label: "Open", className: "border-status-neutral/25 bg-status-neutral-bg text-status-neutral" },
  CLOSED: { label: "Closed", className: "border-status-neutral/25 bg-status-neutral-bg text-status-neutral" },
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  const { label, className } = STATUS_STYLES[status];

  return (
    <Badge variant="outline" className={`h-5 gap-1.5 rounded-full border px-2 text-[11px] font-medium ${className}`}>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      {label}
    </Badge>
  );
}
