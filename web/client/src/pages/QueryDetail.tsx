import { useEffect, useState } from "react";
import { ArrowLeft, Ban, PhoneOutgoing } from "lucide-react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import type { ConsoleContext } from "@/components/console/ConsoleLayout";

interface QueryView {
  id: string;
  issueSummary: string;
  category: string;
  priority: string;
  status: string;
  attempts: number;
  detectedAt: string;
  orderId: string | null;
  customer: {
    id: string;
    name: string;
    phone: string;
    preferredLang: string;
    outboundConsentAt: string | null;
    outboundConsentSource: string | null;
    doNotCall: boolean;
  };
  product: { name: string; category: string } | null;
  calls: Array<{
    id: string;
    state: string;
    startedAt: string;
    durationSec: number | null;
    outcome: { value: string; confidence: string; evidence: string; rationale: string | null } | null;
    turns: Array<{ id: string; role: string; text: string }>;
  }>;
}

export default function QueryDetail() {
  const { id = "" } = useParams();
  const { tenantSlug } = useOutletContext<ConsoleContext>();
  const navigate = useNavigate();
  const [query, setQuery] = useState<QueryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!id) return;
    try {
      const data = await apiFetch<{ query: QueryView }>(`/api/queries/${id}`);
      setQuery(data.query);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this query");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function recordConsent() {
    if (!query) return;
    const source = window.prompt(`Enter the source of ${query.customer.name}'s verified outbound-call consent (CRM record, date, or recorded opt-in reference):`);
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/queries/${query.id}/consent`, {
        method: "POST",
        body: JSON.stringify({ confirmed: true, source }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record consent");
    } finally {
      setBusy(false);
    }
  }

  async function contact() {
    if (!query || !query.customer.outboundConsentAt || query.customer.doNotCall) return;
    if (!window.confirm(`Place an outbound call to ${query.customer.name} at ${query.customer.phone}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ callSessionId: string }>("/api/calls", {
        method: "POST",
        body: JSON.stringify({ queryId: query.id }),
      });
      navigate(`/calls/${result.callSessionId}?tenantSlug=${tenantSlug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Call could not be started");
    } finally {
      setBusy(false);
    }
  }

  async function updateDoNotCall(doNotCall: boolean) {
    if (!query) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/queries/${query.id}/do-not-call`, {
        method: "PATCH",
        body: JSON.stringify({ doNotCall }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the do-not-call setting");
    } finally {
      setBusy(false);
    }
  }

  if (error && !query) return <p role="alert" className="rounded-xl border border-status-danger/25 bg-status-danger-bg px-3.5 py-2.5 text-sm text-status-danger">{error}</p>;
  if (!query) return <p className="text-sm text-tertiary">Loading query…</p>;

  const terminal = query.status === "RESOLVED";

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to={`/queries?tenantSlug=${tenantSlug}`} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-tertiary transition-colors hover:text-primary"><ArrowLeft className="size-4" /> Back to queries</Link>
          <h1 className="font-heading text-3xl font-medium tracking-tight text-ink">{query.customer.name}</h1>
          <p className="mt-1.5 text-sm text-tertiary">{query.orderId ?? "Order"} · {query.product?.name ?? query.category}</p>
        </div>
        <div className="flex items-center gap-2">
          {query.customer.doNotCall ? (
            <button type="button" disabled={busy || terminal} onClick={() => void recordConsent()} className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-ink shadow-sm transition-colors hover:border-brand-lighter hover:bg-brand-light disabled:opacity-50">Record new consent</button>
          ) : !query.customer.outboundConsentAt ? (
            <button type="button" disabled={busy || terminal} onClick={() => void recordConsent()} className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-ink shadow-sm transition-colors hover:border-brand-lighter hover:bg-brand-light disabled:opacity-50">Record verified consent</button>
          ) : (
            <>
              <button type="button" title={query.status === "NEW" ? "Contact" : "Call again"} aria-label={query.status === "NEW" ? "Contact" : "Call again"} disabled={busy || terminal} onClick={() => void contact()} className="inline-flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-brand-dark disabled:opacity-50"><PhoneOutgoing className="size-4" aria-hidden="true" /></button>
              <button type="button" title="Do not call" aria-label="Do not call" disabled={busy} onClick={() => void updateDoNotCall(true)} className="inline-flex size-10 items-center justify-center rounded-full border border-status-danger/25 text-status-danger disabled:opacity-50"><Ban className="size-4" aria-hidden="true" /></button>
            </>
          )}
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-status-danger/25 bg-status-danger-bg px-3.5 py-2.5 text-sm text-status-danger">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-heading text-base font-medium tracking-tight text-ink">Issue summary</h2>
            <p className="mt-2 text-sm leading-6 text-tertiary">{query.issueSummary}</p>
          </section>
          <section>
            <h2 className="mb-3 font-heading text-xl font-medium tracking-tight text-ink">Call history</h2>
            <TableShell>
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-brand-light text-[11px] font-medium tracking-wide text-tertiary uppercase"><tr><th className="px-4 py-2.5 font-heading">Started</th><th className="px-4 py-2.5 font-heading">Duration</th><th className="px-4 py-2.5 font-heading">Outcome</th><th className="px-4 py-2.5 font-heading">Call</th></tr></thead>
                <tbody>
                  {query.calls.map((call) => <tr key={call.id} className="border-t border-border transition-colors hover:bg-brand-light/70"><td className="px-4 py-2.5">{new Date(call.startedAt).toLocaleString()}</td><td className="px-4 py-2.5 font-mono tabular-nums">{call.durationSec == null ? "—" : `${call.durationSec}s`}</td><td className="px-4 py-2.5 capitalize">{call.outcome?.value.replaceAll("_", " ").toLowerCase() ?? "Pending"}</td><td className="px-4 py-2.5"><Link className="font-medium text-primary hover:underline" to={`/calls/${call.id}?tenantSlug=${tenantSlug}`}>Open</Link></td></tr>)}
                  {query.calls.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-tertiary">No calls placed yet.</td></tr>}
                </tbody>
              </table>
            </TableShell>
          </section>
        </div>
        <aside className="h-fit rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-heading text-base font-medium tracking-tight text-ink">Customer contact</h2>
          <dl className="mt-3 flex flex-col gap-3 text-sm">
            <div><dt className="text-xs text-tertiary">Phone</dt><dd className="mt-0.5 font-mono text-ink">{query.customer.phone}</dd></div>
            <div><dt className="text-xs text-tertiary">Preferred language</dt><dd className="mt-0.5 text-ink">{query.customer.preferredLang}</dd></div>
            <div><dt className="text-xs text-tertiary">Outbound consent</dt><dd className="mt-0.5 text-ink">{query.customer.outboundConsentAt ? `Recorded ${new Date(query.customer.outboundConsentAt).toLocaleDateString()}` : "Not recorded"}</dd></div>
            {query.customer.outboundConsentSource && <div><dt className="text-xs text-tertiary">Consent source</dt><dd className="mt-0.5 break-words text-ink">{query.customer.outboundConsentSource}</dd></div>}
            <div><dt className="text-xs text-tertiary">Do not call</dt><dd className="mt-0.5 text-ink">{query.customer.doNotCall ? "Yes" : "No"}</dd></div>
          </dl>
        </aside>
      </div>
    </div>
  );
}

function TableShell({ children }: { children: React.ReactNode }) {
  return <div className="overflow-auto rounded-2xl border border-border bg-card shadow-sm">{children}</div>;
}
