import { useEffect, useState } from "react";
import { Ban, CircleCheck, CirclePause, CircleX, ClipboardCheck, PhoneOutgoing } from "lucide-react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ConsoleContext } from "@/components/console/ConsoleLayout";

type QueryStatus = "NEW" | "CALLING" | "ONGOING" | "RESOLVED" | "HUMAN_REVIEW" | "FAILED";

interface OutboundQuery {
  id: string;
  issueSummary: string;
  category: string;
  priority: "HIGH" | "NORMAL";
  status: QueryStatus;
  attempts: number;
  detectedAt: string;
  orderId: string | null;
  customer: {
    id: string;
    name: string;
    phone: string;
    preferredLang: string;
    outboundConsentAt: string | null;
    outboundConsentSource?: string | null;
    doNotCall: boolean;
  };
  product: { name: string; category: string } | null;
  calls: Array<{ id: string; state: string; startedAt: string; endedAt: string | null }>;
}

const STATUS_META: Record<QueryStatus, { label: string; tone: string; Icon: typeof CircleCheck }> = {
  NEW: { label: "New", tone: "text-status-neutral bg-status-neutral-bg border-status-neutral/25", Icon: CirclePause },
  CALLING: { label: "Calling", tone: "text-status-success bg-status-success-bg border-status-success/25", Icon: PhoneOutgoing },
  ONGOING: { label: "Ongoing", tone: "text-status-warning bg-status-warning-bg border-status-warning/25", Icon: CirclePause },
  RESOLVED: { label: "Resolved", tone: "text-status-success bg-status-success-bg border-status-success/25", Icon: CircleCheck },
  HUMAN_REVIEW: { label: "Needs human", tone: "text-status-danger bg-status-danger-bg border-status-danger/25", Icon: CircleX },
  FAILED: { label: "Call failed", tone: "text-status-danger bg-status-danger-bg border-status-danger/25", Icon: CircleX },
};

const HEAD_BASE = "sticky top-0 h-10 bg-brand-light px-3 font-heading text-[11px] font-medium tracking-wide text-tertiary uppercase";
const STICKY_STATUS_WIDTH = "w-[140px]";
const STICKY_ACTION_WIDTH = "w-[96px]";
const HEAD_COLUMNS = [
  { label: "Priority", className: `${HEAD_BASE} z-10 w-[90px]` },
  { label: "Customer", className: `${HEAD_BASE} z-10 w-[200px]` },
  { label: "Product", className: `${HEAD_BASE} z-10 w-[170px]` },
  { label: "Order", className: `${HEAD_BASE} z-10 w-[110px]` },
  { label: "Issue", className: `${HEAD_BASE} z-10 w-[260px]` },
  { label: "Detected", className: `${HEAD_BASE} z-10 w-[110px]` },
  { label: "Attempts", className: `${HEAD_BASE} z-10 w-[90px]` },
  { label: "Status", className: `${HEAD_BASE} right-[96px] z-20 ${STICKY_STATUS_WIDTH} border-l border-border` },
  { label: "Action", className: `${HEAD_BASE} right-0 z-20 ${STICKY_ACTION_WIDTH}` },
] as const;

function StatusBadge({ status }: { status: QueryStatus }) {
  const { label, tone, Icon } = STATUS_META[status];
  return (
    <Badge variant="outline" className={`h-5 gap-1.5 rounded-full border px-2 text-[11px] font-medium ${tone}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </Badge>
  );
}

export default function Queries() {
  const { tenantSlug } = useOutletContext<ConsoleContext>();
  const navigate = useNavigate();
  const [queries, setQueries] = useState<OutboundQuery[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadQueries() {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    const suffix = params.toString() ? `?${params}` : "";
    const data = await apiFetch<{ queries: OutboundQuery[] }>(`/api/queries${suffix}`);
    setQueries(data.queries);
  }

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("q", search.trim());
        const suffix = params.toString() ? `?${params}` : "";
        const data = await apiFetch<{ queries: OutboundQuery[] }>(`/api/queries${suffix}`);
        if (!cancelled) {
          setQueries(data.queries);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load queries");
      }
    };
    void load();
    const interval = setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [search]);

  async function recordConsent(query: OutboundQuery) {
    const source = window.prompt(`Enter the source of ${query.customer.name}'s verified outbound-call consent (CRM record, date, or recorded opt-in reference):`);
    if (!source) return;
    setBusyId(query.id);
    setError(null);
    try {
      await apiFetch(`/api/queries/${query.id}/consent`, {
        method: "POST",
        body: JSON.stringify({ confirmed: true, source }),
      });
      setNotice(`Recorded the consent source for ${query.customer.name}.`);
      await loadQueries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update consent");
    } finally {
      setBusyId(null);
    }
  }

  async function setDoNotCall(query: OutboundQuery, doNotCall: boolean) {
    setBusyId(query.id);
    setError(null);
    try {
      await apiFetch(`/api/queries/${query.id}/do-not-call`, {
        method: "PATCH",
        body: JSON.stringify({ doNotCall }),
      });
      setNotice(doNotCall ? `${query.customer.name} was placed on the do-not-call list.` : "Do-not-call status cleared.");
      await loadQueries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the do-not-call setting");
    } finally {
      setBusyId(null);
    }
  }

  async function contact(query: OutboundQuery) {
    if (!query.customer.outboundConsentAt || query.customer.doNotCall) return;
    if (!window.confirm(`Place an outbound call to ${query.customer.name} at ${query.customer.phone}?`)) return;
    setBusyId(query.id);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<{ callSessionId: string }>("/api/calls", {
        method: "POST",
        body: JSON.stringify({ queryId: query.id }),
      });
      setNotice(`Call started for ${query.customer.name}.`);
      navigate(`/calls/${result.callSessionId}?tenantSlug=${tenantSlug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Call could not be started");
    } finally {
      setBusyId(null);
    }
  }

  const openCount = queries.filter((query) => query.status === "NEW" || query.status === "ONGOING").length;
  const callableCount = queries.filter((query) => query.customer.outboundConsentAt && !query.customer.doNotCall && ["NEW", "ONGOING", "FAILED", "HUMAN_REVIEW"].includes(query.status)).length;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-light px-2.5 py-1 text-xs font-medium text-primary">
            <PhoneOutgoing className="size-3" aria-hidden="true" />
            Outbound
          </span>
          <h1 className="mt-3 font-heading text-3xl font-medium tracking-tight text-ink">
            Customer <span className="text-primary">queries</span>
          </h1>
          <p className="mt-1.5 text-sm text-tertiary">Proactive customer follow-up. Calls require recorded consent and are limited to India calling hours.</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-[13px] font-medium text-tertiary">Open queries</p>
          <p className="mt-3 font-heading text-3xl leading-none font-medium tabular-nums text-ink">{openCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-[13px] font-medium text-tertiary">Contactable with consent</p>
          <p className="mt-3 font-heading text-3xl leading-none font-medium tabular-nums text-primary">{callableCount}</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-border bg-card p-5 shadow-sm sm:col-span-1">
          <label htmlFor="query-search" className="text-[13px] font-medium text-tertiary">Search</label>
          <input
            id="query-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Customer, order, issue"
            className="mt-2 w-full rounded-xl border border-border bg-brand-light/40 px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-brand-lighter focus-visible:ring-4 focus-visible:ring-brand/10"
          />
        </div>
      </div>

      {notice && <p role="status" className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink shadow-sm">{notice}</p>}
      {error && <p role="alert" className="rounded-xl border border-status-danger/25 bg-status-danger-bg px-3.5 py-2.5 text-sm text-status-danger">{error}</p>}

      <Table className="table-fixed text-sm" containerClassName="max-h-[65svh] overflow-y-auto" style={{ width: 1266 }}>
        <TableHeader>
          <TableRow className="h-10 hover:bg-transparent">
            {HEAD_COLUMNS.map((column) => (
              <TableHead key={column.label} className={column.className}>{column.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {queries.map((query) => {
            const consented = Boolean(query.customer.outboundConsentAt) && !query.customer.doNotCall;
            const terminal = query.status === "RESOLVED";
            const isBusy = busyId === query.id || query.status === "CALLING";
            return (
              <TableRow
                key={query.id}
                className="group h-12 cursor-pointer hover:bg-brand-light/70 focus-visible:outline-2 focus-visible:outline-ring"
                role="link"
                tabIndex={0}
                aria-label={`Open query for ${query.customer.name}`}
                onClick={() => navigate(`/queries/${query.id}?tenantSlug=${tenantSlug}`)}
                onKeyDown={(event) => { if (event.key === "Enter") navigate(`/queries/${query.id}?tenantSlug=${tenantSlug}`); }}
              >
                <TableCell className="px-3 py-2">
                  <span className={`inline-flex items-center gap-1.5 ${query.priority === "HIGH" ? "text-status-danger" : "text-tertiary"}`}>
                    <span className={`size-2 rounded-full ${query.priority === "HIGH" ? "bg-status-danger" : "bg-status-neutral"}`} />
                    {query.priority === "HIGH" ? "High" : "Normal"}
                  </span>
                </TableCell>
                <TableCell className="px-3 py-2">
                  <span className="block font-medium text-ink">{query.customer.name}</span>
                  <span className="block text-xs text-tertiary">{query.customer.phone} · {query.customer.preferredLang}</span>
                </TableCell>
                <TableCell className="px-3 py-2">{query.product?.name ?? "—"}</TableCell>
                <TableCell className="px-3 py-2 font-mono text-[13px] tabular-nums">{query.orderId ?? "—"}</TableCell>
                <TableCell className="max-w-[300px] truncate px-3 py-2" title={query.issueSummary}>{query.issueSummary}</TableCell>
                <TableCell className="px-3 py-2 text-tertiary">{new Date(query.detectedAt).toLocaleDateString()}</TableCell>
                <TableCell className="px-3 py-2 text-right font-mono tabular-nums">{query.attempts || "—"}</TableCell>
                <TableCell className={`sticky right-[96px] z-10 ${STICKY_STATUS_WIDTH} border-l border-border bg-card p-0`}>
                  <div className="w-[140px] px-3 py-2">
                    <StatusBadge status={query.status} />
                  </div>
                </TableCell>
                <TableCell className={`sticky right-0 z-10 ${STICKY_ACTION_WIDTH} bg-card p-0`}>
                  <div className="w-[96px] px-3 py-2">
                  {query.customer.doNotCall ? (
                    <button type="button" title="Record new consent" aria-label="Record new consent" disabled={isBusy || terminal} onClick={(event) => { event.stopPropagation(); void recordConsent(query); }} className="inline-flex size-8 items-center justify-center rounded-full border border-border text-tertiary transition-colors hover:border-brand-lighter hover:text-primary disabled:opacity-50">
                      <ClipboardCheck className="size-4" aria-hidden="true" />
                    </button>
                  ) : !query.customer.outboundConsentAt ? (
                    <button type="button" title="Record consent" aria-label="Record consent" disabled={isBusy || terminal} onClick={(event) => { event.stopPropagation(); void recordConsent(query); }} className="inline-flex size-8 items-center justify-center rounded-full border border-border text-tertiary transition-colors hover:border-brand-lighter hover:text-primary disabled:opacity-50">
                      <ClipboardCheck className="size-4" aria-hidden="true" />
                    </button>
                  ) : !consented ? (
                    <button type="button" title="Do not call" aria-label="Do not call" disabled={isBusy} onClick={(event) => { event.stopPropagation(); void setDoNotCall(query, true); }} className="inline-flex size-8 items-center justify-center rounded-full border border-status-danger/25 text-status-danger disabled:opacity-50">
                      <Ban className="size-4" aria-hidden="true" />
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        title={query.status === "NEW" ? "Contact" : "Call again"}
                        aria-label={query.status === "NEW" ? "Contact" : "Call again"}
                        disabled={isBusy || terminal}
                        onClick={(event) => { event.stopPropagation(); void contact(query); }}
                        className="inline-flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-brand-dark disabled:opacity-50"
                      >
                        <PhoneOutgoing className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        title="Do not call"
                        aria-label="Do not call"
                        disabled={isBusy}
                        onClick={(event) => { event.stopPropagation(); void setDoNotCall(query, true); }}
                        className="inline-flex size-8 items-center justify-center rounded-full border border-status-danger/25 text-status-danger disabled:opacity-50"
                      >
                        <Ban className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {queries.length === 0 && <TableRow><TableCell colSpan={9} className="h-16 px-3 text-center text-sm text-tertiary">No outbound queries found.</TableCell></TableRow>}
        </TableBody>
      </Table>
      <p className="text-xs text-tertiary">Contact is enabled only after verified consent is recorded. Respect do-not-call requests immediately.</p>
    </div>
  );
}
