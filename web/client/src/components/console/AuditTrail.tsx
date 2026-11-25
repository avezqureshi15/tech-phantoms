import { CircleCheck, CircleX } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { AgentAction, PolicyDecision } from "@/lib/types";

const DECISION_LABELS: Record<PolicyDecision, string> = {
  ALLOW: "Allowed",
  DENY: "Denied",
  REQUIRE_HUMAN: "Awaiting approval",
};
const DECISION_STYLES: Record<PolicyDecision, string> = {
  ALLOW: "border-status-success/25 bg-status-success-bg text-status-success",
  DENY: "border-status-danger/25 bg-status-danger-bg text-status-danger",
  REQUIRE_HUMAN: "border-status-warning/25 bg-status-warning-bg text-status-warning",
};

/** The audit trail (§3.5) — this table IS the pitch. */
export function AuditTrail({ actions }: { actions: AgentAction[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-brand-light/60 hover:bg-brand-light/60">
          <TableHead>Time</TableHead>
          <TableHead>Tool</TableHead>
          <TableHead>Args</TableHead>
          <TableHead>Decision</TableHead>
          <TableHead>Executed</TableHead>
          <TableHead>Deny reason</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {actions.map((a) => (
          <TableRow key={a.id}>
            <TableCell className="text-tertiary">{new Date(a.createdAt).toLocaleTimeString()}</TableCell>
            <TableCell className="font-mono text-sm">{a.tool}</TableCell>
            <TableCell className="font-mono text-xs">{JSON.stringify(a.args)}</TableCell>
            <TableCell>
              <Badge variant="outline" className={`h-5 gap-1.5 rounded-full border px-2 text-[11px] font-medium ${DECISION_STYLES[a.policyDecision]}`}>
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
                {DECISION_LABELS[a.policyDecision]}
              </Badge>
            </TableCell>
            <TableCell>
              {a.executed
                ? <CircleCheck className="size-4 text-status-success" aria-label="Executed" />
                : <CircleX className="size-4 text-status-danger" aria-label="Not executed" />}
            </TableCell>
            <TableCell>{a.denyReason ?? "—"}</TableCell>
          </TableRow>
        ))}
        {actions.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-tertiary">
              No agent actions yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
