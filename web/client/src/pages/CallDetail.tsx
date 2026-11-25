import { useEffect, useState } from "react";
import { ArrowLeft, PhoneOff } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiFetch } from "@/lib/api";

interface CallSessionView {
  id: string;
  state: "DIALING" | "RINGING" | "CONNECTED" | "WRAPPING_UP" | "ENDED" | "FAILED";
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  toNumber: string;
  query: {
    id: string;
    issueSummary: string;
    orderId: string | null;
    customer: { name: string };
    product: { name: string } | null;
  };
  turns: Array<{ id: string; idx: number; role: "AGENT" | "CUSTOMER"; text: string; lang: string | null; createdAt: string; citedArticleIds: string[] }>;
  outcome: { value: "RESOLVED" | "ONGOING" | "HUMAN_REVIEW"; confidence: string; evidence: string; rationale: string | null } | null;
  actions: Array<{ id: string; tool: string; policyDecision: string; executed: boolean; denyReason: string | null; args: Record<string, unknown> }>;
}

function isActive(state: CallSessionView["state"]): boolean {
  return state === "DIALING" || state === "RINGING" || state === "CONNECTED" || state === "WRAPPING_UP";
}

const fieldClass =
  "w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-brand-lighter focus-visible:ring-4 focus-visible:ring-brand/10";

export default function CallDetail() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const tenantSlug = searchParams.get("tenantSlug") ?? "";
  const [call, setCall] = useState<CallSessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideValue, setOverrideValue] = useState<"RESOLVED" | "ONGOING" | "HUMAN_REVIEW">("HUMAN_REVIEW");
  const [overrideEvidence, setOverrideEvidence] = useState("");
  const [overrideNote, setOverrideNote] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiFetch<{ call: CallSessionView }>(`/api/calls/${id}`);
        if (!cancelled) {
          setCall(data.call);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Could not load this call.");
      }
    };
    void load();
    const interval = setInterval(() => void load(), 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id]);

  async function endCall() {
    if (!call || !window.confirm(`End the call with ${call.query.customer.name}?`)) return;
    setEnding(true);
    try {
      const data = await apiFetch<{ state: CallSessionView["state"] }>(`/api/calls/${call.id}/end`, {
        method: "POST",
      });
      setCall({ ...call, state: data.state });
    } catch {
      setError("Could not end the call through Twilio.");
    } finally {
      setEnding(false);
    }
  }

  async function saveOverride(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!call) return;
    setEnding(true);
    setError(null);
    try {
      await apiFetch(`/api/calls/${call.id}/outcome`, {
        method: "PATCH",
        body: JSON.stringify({ outcome: overrideValue, evidence: overrideEvidence, note: overrideNote }),
      });
      setShowOverride(false);
      const data = await apiFetch<{ call: CallSessionView }>(`/api/calls/${call.id}`);
      setCall(data.call);
    } catch {
      setError("Outcome was not changed. Resolved requires a verbatim customer confirmation quote from the transcript.");
    } finally {
      setEnding(false);
    }
  }

  if (error && !call) return <p role="alert" className="rounded-xl border border-status-danger/25 bg-status-danger-bg px-3.5 py-2.5 text-sm text-status-danger">{error}</p>;
  if (!call) return <p className="text-sm text-tertiary">Loading call…</p>;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to={`/queries?tenantSlug=${tenantSlug}`} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-tertiary transition-colors hover:text-primary">
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to queries
          </Link>
          <h1 className="font-heading text-3xl font-medium tracking-tight text-ink">{call.query.customer.name}</h1>
          <p className="mt-1.5 text-sm text-tertiary">{call.query.orderId ?? "Order"} · {call.query.product?.name ?? call.query.issueSummary} · {call.toNumber}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border bg-mint px-3 py-1 text-xs font-medium capitalize text-primary">{call.state.replaceAll("_", " ").toLowerCase()}</span>
          {isActive(call.state) && <button type="button" disabled={ending} onClick={() => void endCall()} className="inline-flex items-center gap-1.5 rounded-full border border-status-danger/25 bg-status-danger-bg px-3.5 py-2 text-sm font-medium text-status-danger transition-colors hover:bg-status-danger/10 disabled:opacity-50"><PhoneOff className="size-4" />End call</button>}
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-status-danger/25 bg-status-danger-bg px-3.5 py-2.5 text-sm text-status-danger">{error}</p>}
      {call.errorMessage && <p role="alert" className="rounded-xl border border-status-danger/25 bg-status-danger-bg px-3.5 py-2.5 text-sm text-status-danger">{call.errorMessage}{call.errorCode && <span className="ml-2 font-mono text-xs">{call.errorCode}</span>}</p>}

      {call.outcome && (
        <section className={`rounded-2xl border border-border border-l-[3px] bg-card p-5 shadow-sm ${call.outcome.value === "RESOLVED" ? "border-l-status-success" : call.outcome.value === "ONGOING" ? "border-l-status-warning" : "border-l-status-danger"}`}>
          <h2 className="font-heading text-lg font-medium tracking-tight text-ink">{call.outcome.value === "RESOLVED" ? "Resolved" : call.outcome.value === "ONGOING" ? "Still ongoing" : "Needs human review"}</h2>
          <p className="mt-1 text-sm text-tertiary">{call.outcome.rationale}</p>
          {call.outcome.evidence && <blockquote className="mt-3 rounded-xl bg-brand-light/70 border-l-2 border-primary/40 px-4 py-2.5 text-sm text-ink">“{call.outcome.evidence}”</blockquote>}
          <p className="mt-2 text-xs capitalize text-tertiary">Confidence: {call.outcome.confidence.toLowerCase()}</p>
          <button type="button" onClick={() => { setOverrideValue(call.outcome?.value ?? "HUMAN_REVIEW"); setShowOverride((value) => !value); }} className="mt-3 text-sm font-medium text-primary hover:underline">Change outcome</button>
        </section>
      )}

      {showOverride && (
        <form onSubmit={saveOverride} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-heading text-base font-medium tracking-tight text-ink">Change outcome</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="outcome-value" className="mb-1.5 block text-xs font-medium text-tertiary">Outcome</label>
              <select id="outcome-value" value={overrideValue} onChange={(event) => setOverrideValue(event.target.value as typeof overrideValue)} className={fieldClass}>
                <option value="RESOLVED">Resolved</option>
                <option value="ONGOING">Still ongoing</option>
                <option value="HUMAN_REVIEW">Needs human review</option>
              </select>
            </div>
            <div>
              <label htmlFor="outcome-evidence" className="mb-1.5 block text-xs font-medium text-tertiary">Verbatim transcript evidence</label>
              <input id="outcome-evidence" value={overrideEvidence} onChange={(event) => setOverrideEvidence(event.target.value)} placeholder="Copy the exact quote" className={fieldClass} />
            </div>
          </div>
          <label htmlFor="outcome-note" className="mt-3 mb-1.5 block text-xs font-medium text-tertiary">Operator note</label>
          <textarea id="outcome-note" value={overrideNote} onChange={(event) => setOverrideNote(event.target.value)} rows={2} maxLength={500} className={fieldClass} />
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={ending} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-brand-dark disabled:opacity-50">Save outcome</button>
            <button type="button" onClick={() => setShowOverride(false)} className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-brand-light">Cancel</button>
          </div>
        </form>
      )}

      <section>
        <h2 className="mb-3 font-heading text-xl font-medium tracking-tight text-ink">Transcript</h2>
        <div className="flex flex-col gap-3">
          {call.turns.map((turn) => (
            <article key={turn.id} className={`max-w-3xl rounded-2xl border border-border px-4 py-3 shadow-sm ${turn.role === "CUSTOMER" ? "bg-brand-light/70 sm:ml-auto" : "bg-card"}`}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs font-medium text-tertiary">
                <span>{turn.role === "CUSTOMER" ? "Customer" : "Diya"}</span>
                <time>{new Date(turn.createdAt).toLocaleTimeString()}</time>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-ink">{turn.text}</p>
              {turn.citedArticleIds.length > 0 && <p className="mt-2 text-xs text-tertiary">Knowledge articles: {turn.citedArticleIds.join(", ")}</p>}
            </article>
          ))}
          {call.turns.length === 0 && <p className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-sm text-tertiary shadow-sm">Transcript will appear when the call connects.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-xl font-medium tracking-tight text-ink">Agent actions</h2>
        <div className="overflow-auto rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-brand-light text-[11px] font-medium tracking-wide text-tertiary uppercase"><tr><th className="px-4 py-2.5 font-heading">Tool</th><th className="px-4 py-2.5 font-heading">Decision</th><th className="px-4 py-2.5 font-heading">Executed</th><th className="px-4 py-2.5 font-heading">Reason</th></tr></thead>
            <tbody>
              {call.actions.map((action) => <tr key={action.id} className="border-t border-border transition-colors hover:bg-brand-light/70"><td className="px-4 py-2.5 font-mono text-[13px]">{action.tool}</td><td className="px-4 py-2.5 capitalize">{action.policyDecision.replaceAll("_", " ").toLowerCase()}</td><td className="px-4 py-2.5">{action.executed ? "Yes" : "No"}</td><td className="px-4 py-2.5">{action.denyReason ?? "—"}</td></tr>)}
              {call.actions.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-tertiary">No agent actions recorded.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
