import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import type { Ticket, Metrics, Approval, ResolvedFlags } from "@/lib/types";
import { MetricTiles } from "@/components/console/MetricTiles";
import { TicketFeed } from "@/components/console/TicketFeed";
import { ApprovalPanel } from "@/components/console/ApprovalPanel";
import { FlagMirror } from "@/components/console/FlagMirror";
import type { ConsoleContext } from "@/components/console/ConsoleLayout";

const POLL_MS = 2000;

export default function Console() {
  const { tenantSlug } = useOutletContext<ConsoleContext>();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [flags, setFlags] = useState<ResolvedFlags | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantSlug) return;

    let cancelled = false;

    async function poll() {
      try {
        const [ticketsData, metricsData, approvalsData, flagsData] = await Promise.all([
          apiFetch<{ tickets: Ticket[] }>("/api/console/tickets"),
          apiFetch<Metrics>("/api/console/metrics"),
          apiFetch<{ approvals: Approval[] }>("/api/console/approvals"),
          apiFetch<ResolvedFlags>("/api/console/flags"),
        ]);
        if (cancelled) return;
        setTickets(ticketsData.tickets);
        setMetrics(metricsData);
        setApprovals(approvalsData.approvals);
        setFlags(flagsData);
        setError(null);
      } catch {
        if (!cancelled) setError("Couldn't reach the API — is the server/database up?");
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [tenantSlug]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-light px-2.5 py-1 text-xs font-medium text-primary">
            <span className="size-1.5 rounded-full bg-primary" />
            Live
          </span>
          <h1 className="mt-3 font-heading text-3xl font-medium tracking-tight text-ink">
            Support <span className="text-primary">overview</span>
          </h1>
          <p className="mt-1.5 text-sm text-tertiary">Live support operations and recent activity.</p>
        </div>
        <FlagMirror flags={flags} />
      </header>

      {error && <p role="alert" className="rounded-xl border border-status-danger/25 bg-status-danger-bg px-3.5 py-2.5 text-sm text-status-danger">{error}</p>}

      <MetricTiles metrics={metrics} />
      <ApprovalPanel approvals={approvals} tenantSlug={tenantSlug} />
      <section id="tickets" className="scroll-mt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-medium tracking-tight text-ink">Recent tickets</h2>
            <p className="mt-0.5 text-sm text-tertiary">Latest customer conversations and outcomes.</p>
          </div>
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium tabular-nums text-tertiary">{tickets.length} total</span>
        </div>
        <TicketFeed tickets={tickets} tenantSlug={tenantSlug} />
      </section>
    </div>
  );
}
