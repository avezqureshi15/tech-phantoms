import { CircleCheck, CirclePause, CircleX } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Ticket } from "@/lib/types";
import { StatusBadge } from "@/components/console/StatusBadge";

function describeAction(ticket: Ticket) {
  const action = ticket.actions?.[0];
  if (!action) return "—";
  const amount = typeof action.args.amountInr === "number" ? `₹${action.args.amountInr}` : "";
  if (action.tool === "issue_refund") {
    const outcome = action.executed
      ? { label: "Refund issued", Icon: CircleCheck, color: "text-status-success" }
      : action.policyDecision === "REQUIRE_HUMAN"
        ? { label: "Awaiting approval", Icon: CirclePause, color: "text-status-warning" }
        : { label: "Refund denied", Icon: CircleX, color: "text-status-danger" };
    return (
      <div className="flex min-w-[210px] items-center justify-between gap-3">
        <span className={`inline-flex items-center gap-1.5 ${outcome.color}`}>
          <outcome.Icon className="size-4" aria-hidden="true" />
          {outcome.label}
        </span>
        {amount && <span className="ml-auto font-mono text-[13px] tabular-nums text-ink">{amount}</span>}
      </div>
    );
  }
  return action.tool.replaceAll("_", " ");
}

/** Ticket feed columns, exact order from §3.5. */
export function TicketFeed({ tickets, tenantSlug }: { tickets: Ticket[]; tenantSlug: string }) {
  const navigate = useNavigate();

  return (
    <Table className="min-w-[1080px] text-sm" containerClassName="max-h-[60svh] overflow-y-auto">
      <TableHeader>
        <TableRow className="h-10 hover:bg-transparent">
          {(["Time", "Customer", "Order", "Lang", "Issue", "Status", "Action taken"] as const).map((heading) => (
            <TableHead key={heading} className="sticky top-0 z-10 h-10 bg-brand-light px-3 font-heading text-[11px] font-medium tracking-wide text-tertiary uppercase">
              {heading}
            </TableHead>
          ))}
          <TableHead className="sticky top-0 z-10 h-10 bg-brand-light px-3 text-right font-heading text-[11px] font-medium tracking-wide text-tertiary uppercase">Latency</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tickets.map((ticket) => {
          const href = `/console/tickets/${ticket.id}?tenantSlug=${tenantSlug}`;
          return (
            <TableRow
              key={ticket.id}
              className="h-12 cursor-pointer text-sm hover:bg-brand-light/70 focus-visible:outline-2 focus-visible:outline-ring"
              role="link"
              tabIndex={0}
              aria-label={`Open ticket for ${ticket.customer?.name ?? "unknown customer"}`}
              onClick={() => navigate(href)}
              onKeyDown={(event) => {
                if (event.key === "Enter") navigate(href);
              }}
            >
              <TableCell className="px-3 py-2.5 text-tertiary">{new Date(ticket.openedAt).toLocaleTimeString()}</TableCell>
              <TableCell className="px-3 py-2.5 font-medium text-ink">{ticket.customer?.name ?? "—"}</TableCell>
              <TableCell className="px-3 py-2.5 font-mono text-[13px] tabular-nums">{ticket.orderId ?? "—"}</TableCell>
              <TableCell className="px-3 py-2.5">{ticket.language}</TableCell>
              <TableCell className="px-3 py-2.5">{ticket.issueCluster ?? "—"}</TableCell>
              <TableCell className="px-3 py-2.5"><StatusBadge status={ticket.status} /></TableCell>
              <TableCell className="px-3 py-2.5">{describeAction(ticket)}</TableCell>
              <TableCell className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums">
                {ticket.messages?.[0]?.latencyMs != null ? `${(ticket.messages[0].latencyMs / 1000).toFixed(1)}s` : "—"}
              </TableCell>
            </TableRow>
          );
        })}
        {tickets.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="h-16 px-3 text-center text-sm text-tertiary">
              No tickets yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
