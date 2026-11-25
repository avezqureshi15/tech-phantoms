import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import type { Ticket, Message, AgentAction, Approval, DisplayMessage } from "@/lib/types";
import { Transcript } from "@/components/voice/Transcript";
import { AuditTrail } from "@/components/console/AuditTrail";
import { FlagSnapshot } from "@/components/console/FlagSnapshot";
import { StatusBadge } from "@/components/console/StatusBadge";

interface TicketDetailResponse {
  ticket: Ticket;
  messages: Message[];
  actions: AgentAction[];
  approval: Approval | null;
}

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const tenantSlug = searchParams.get("tenantSlug") ?? "";

  const [data, setData] = useState<TicketDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !tenantSlug) return;
    apiFetch<TicketDetailResponse>(`/api/console/tickets/${id}`)
      .then(setData)
      .catch(() => setError("Couldn't load this ticket — is the server/database up?"));
  }, [id, tenantSlug]);

  if (error) return <p className="p-6 text-status-danger">{error}</p>;
  if (!data) return <p className="p-6 text-tertiary">Loading…</p>;

  const { ticket, messages, actions, approval } = data;
  const displayMessages: DisplayMessage[] = messages.map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
    lang: m.lang,
    latencyMs: m.latencyMs,
  }));

  const decisiveAction = [...actions].reverse().find((a) => a.policyDecision !== undefined);
  const handleTimeSeconds = ticket.resolvedAt
    ? Math.round((new Date(ticket.resolvedAt).getTime() - new Date(ticket.openedAt).getTime()) / 1000)
    : null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <Link to={`/console?tenantSlug=${tenantSlug}`} className="w-fit text-sm font-medium text-tertiary transition-colors hover:text-primary">
        ← Back to console
      </Link>

      {/* 1. Header */}
      <section className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-3xl font-medium tracking-tight text-ink">{ticket.customer?.name ?? "Unknown customer"}</h1>
        <StatusBadge status={ticket.status} />
        <span className="rounded-full bg-brand-light px-2.5 py-1 text-xs font-medium text-primary">{ticket.language}</span>
        {ticket.orderId && <span className="font-mono text-sm text-tertiary">{ticket.orderId}</span>}
        {handleTimeSeconds != null && (
          <span className="text-sm text-tertiary">handled in {handleTimeSeconds}s</span>
        )}
      </section>

      {/* 2. Transcript */}
      <section>
        <h2 className="mb-3 font-heading text-xl font-medium tracking-tight text-ink">Transcript</h2>
        <Transcript messages={displayMessages} />
      </section>

      {/* 3. Audit trail */}
      <section>
        <h2 className="mb-3 font-heading text-xl font-medium tracking-tight text-ink">Audit trail</h2>
        <AuditTrail actions={actions} />
      </section>

      {/* 4. Flag snapshot */}
      <section>
        <h2 className="mb-3 font-heading text-xl font-medium tracking-tight text-ink">Flag snapshot</h2>
        <FlagSnapshot snapshot={decisiveAction?.flagSnapshot ?? null} />
      </section>

      {/* 5. Approval card */}
      {approval && (
        <section>
          <h2 className="mb-3 font-heading text-xl font-medium tracking-tight text-ink">Approval</h2>
          <div className="rounded-2xl border border-border bg-card p-5 text-sm shadow-sm">
            <p className="text-ink"><span className="text-tertiary">Status:</span> {approval.status.charAt(0) + approval.status.slice(1).toLowerCase()}</p>
            {approval.approver && <p className="mt-1 text-ink"><span className="text-tertiary">Approver:</span> {approval.approver}</p>}
            {approval.workflowRunId && <p className="mt-1 font-mono text-xs text-tertiary">Workflow run: {approval.workflowRunId}</p>}
          </div>
        </section>
      )}
    </div>
  );
}
