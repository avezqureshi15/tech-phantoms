import { useEffect, useState } from "react";
import { ArrowUpRight, Inbox } from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import type { Ticket, Metrics, Approval, ResolvedFlags, Enquiry } from "@/lib/types";
import { MetricTiles } from "@/components/console/MetricTiles";
import { TicketFeed } from "@/components/console/TicketFeed";
import { ApprovalPanel } from "@/components/console/ApprovalPanel";
import { FlagMirror } from "@/components/console/FlagMirror";
import type { ConsoleContext } from "@/components/console/ConsoleLayout";

const POLL_MS = 2000;

export default function Console() {
  const { tenantSlug } = useOutletContext<ConsoleContext>();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [flags, setFlags] = useState<ResolvedFlags | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantSlug) return;

    let cancelled = false;

    async function poll() {
      try {
        const [ticketsData, metricsData, approvalsData, flagsData, enquiriesData] = await Promise.all([
          apiFetch<{ tickets: Ticket[] }>("/api/console/tickets"),
          apiFetch<Metrics>("/api/console/metrics"),
          apiFetch<{ approvals: Approval[] }>("/api/console/approvals"),
          apiFetch<ResolvedFlags>("/api/console/flags"),
          apiFetch<{ enquiries: Enquiry[] }>("/api/enquiries?limit=4"),
        ]);
        if (cancelled) return;
        setTickets(ticketsData.tickets);
        setMetrics(metricsData);
        setApprovals(approvalsData.approvals);
        setFlags(flagsData);
        setEnquiries(enquiriesData.enquiries);
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
      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-light text-primary"><Inbox className="size-5" /></span>
            <div>
              <h2 className="font-heading text-lg font-medium tracking-tight text-ink">Latest website enquiries</h2>
              <p className="text-xs text-tertiary">Customer messages from your Diya widget.</p>
            </div>
          </div>
          <Link to={`/enquiries?tenantSlug=${tenantSlug}`} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-xs font-medium text-ink transition hover:bg-brand-light">
            Open inbox <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
        {enquiries.length > 0 ? (
          <div className="divide-y divide-border/70">
            {enquiries.map((enquiry) => (
              <Link key={enquiry.id} to={`/enquiries?tenantSlug=${tenantSlug}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-brand-light/40 sm:px-6">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{enquiry.name}</span>
                    <span className="text-xs text-tertiary">{enquiry.email ?? enquiry.phone}</span>
                  </span>
                  <span className="mt-1 block truncate text-sm text-tertiary">{enquiry.productName ? `${enquiry.productName}: ` : ""}{enquiry.message}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${enquiry.status === "NEW" ? "bg-status-warning-bg text-status-warning" : enquiry.status === "REVIEWED" ? "bg-mint text-primary" : "bg-brand-light text-tertiary"}`}>{enquiry.status.toLowerCase()}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-tertiary sm:px-6">Website enquiries submitted to this workspace will appear here.</p>
        )}
      </section>
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
