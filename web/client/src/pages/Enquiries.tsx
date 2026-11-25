import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Clock3, Inbox, Mail, MessageSquareText, Phone, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { Enquiry, EnquiryStatus } from "@/lib/types";

const FILTERS: { label: string; value: EnquiryStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "New", value: "NEW" },
  { label: "Reviewed", value: "REVIEWED" },
  { label: "Closed", value: "CLOSED" },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusStyle(status: EnquiryStatus) {
  if (status === "NEW") return "bg-status-warning-bg text-status-warning";
  if (status === "REVIEWED") return "bg-mint text-primary";
  return "bg-brand-light text-tertiary";
}

export default function Enquiries() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<EnquiryStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await apiFetch<{ enquiries: Enquiry[] }>("/api/enquiries");
        if (cancelled) return;
        setEnquiries(response.enquiries);
        setSelectedId((current) => current ?? response.enquiries[0]?.id ?? null);
        setError(null);
      } catch {
        if (!cancelled) setError("Couldn't load enquiries. Check that the server and database are available.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const interval = setInterval(() => void load(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const visibleEnquiries = filter === "ALL" ? enquiries : enquiries.filter((enquiry) => enquiry.status === filter);
  const selected = visibleEnquiries.find((enquiry) => enquiry.id === selectedId) ?? visibleEnquiries[0] ?? null;
  const newCount = enquiries.filter((enquiry) => enquiry.status === "NEW").length;

  async function updateStatus(enquiry: Enquiry, status: EnquiryStatus) {
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch<{ enquiry: Enquiry }>(`/api/enquiries/${enquiry.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (response.enquiry) {
        setEnquiries((current) => current.map((item) => item.id === response.enquiry!.id ? response.enquiry! : item));
      }
    } catch {
      setError("Couldn't update this enquiry. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Customer inbox</p>
          <h1 className="mt-2 font-heading text-4xl font-medium tracking-tight text-ink">Enquiries</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-tertiary">Messages collected by your Diya website widget. No replies are sent from here yet.</p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
          <span className="flex size-9 items-center justify-center rounded-xl bg-status-warning-bg text-status-warning"><Inbox className="size-4" /></span>
          <div><p className="text-lg font-semibold leading-5 text-ink">{newCount}</p><p className="mt-1 text-xs text-tertiary">new to review</p></div>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-status-danger/25 bg-status-danger-bg px-4 py-3 text-sm text-status-danger">{error}</p>}

      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter enquiries">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={filter === item.value}
                onClick={() => setFilter(item.value)}
                className={`rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${filter === item.value ? "bg-ink text-white" : "text-tertiary hover:bg-brand-light hover:text-ink"}`}
              >
                {item.label}{item.value === "NEW" && newCount > 0 && <span className="ml-2 rounded-full bg-white/15 px-1.5 py-0.5 text-[11px]">{newCount}</span>}
              </button>
            ))}
          </div>
          <span className="text-xs text-tertiary">{enquiries.length} total</span>
        </div>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center text-sm text-tertiary">Loading enquiries…</div>
        ) : enquiries.length === 0 ? (
          <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-light text-primary"><MessageSquareText className="size-6" /></span>
            <h2 className="mt-5 font-heading text-xl font-medium text-ink">Your first enquiry will land here</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-tertiary">Install the Diya widget on your site and customer notes will appear in this inbox.</p>
          </div>
        ) : visibleEnquiries.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-tertiary">No enquiries in this view.</div>
        ) : (
          <div className="grid min-h-[590px] lg:grid-cols-[minmax(300px,0.8fr)_minmax(420px,1.2fr)]">
            <div className="max-h-[70vh] overflow-y-auto border-b border-border lg:border-b-0 lg:border-r">
              {visibleEnquiries.map((enquiry) => (
                <button
                  key={enquiry.id}
                  type="button"
                  onClick={() => setSelectedId(enquiry.id)}
                  className={`block w-full border-b border-border/70 px-4 py-4 text-left transition-colors sm:px-5 ${selected?.id === enquiry.id ? "bg-brand-light/80" : "hover:bg-brand-light/40"}`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium text-ink">{enquiry.name}</span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusStyle(enquiry.status)}`}>{enquiry.status.toLowerCase()}</span>
                  </span>
                  <span className="mt-1.5 block truncate text-xs text-tertiary">{enquiry.email ?? enquiry.phone ?? "No contact"} · {formatDate(enquiry.createdAt)}</span>
                  <span className="mt-2 line-clamp-2 block text-sm leading-5 text-ink-gray">{enquiry.message}</span>
                  {enquiry.productName && <span className="mt-2 inline-flex max-w-full truncate rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-tertiary">About {enquiry.productName}</span>}
                </button>
              ))}
            </div>

            {selected ? (
              <article className="flex min-w-0 flex-col p-5 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-tertiary">Website enquiry</p>
                    <h2 className="mt-2 font-heading text-2xl font-medium tracking-tight text-ink">{selected.name}</h2>
                    <p className="mt-1 text-sm text-tertiary">Received {formatDate(selected.createdAt)}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${statusStyle(selected.status)}`}>{selected.status.toLowerCase()}</span>
                </div>

                <div className="mt-7 rounded-2xl bg-brand-light/65 p-5 sm:p-6">
                  <p className="whitespace-pre-wrap text-[15px] leading-7 text-ink">{selected.message}</p>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {selected.email && <a href={`mailto:${selected.email}`} className="flex min-w-0 items-center gap-3 rounded-2xl border border-border p-4 transition-colors hover:border-primary/35 hover:bg-brand-light/40"><Mail className="size-4 shrink-0 text-primary" /><span className="min-w-0"><span className="block text-[11px] uppercase tracking-wide text-tertiary">Email</span><span className="mt-1 block truncate text-sm font-medium text-ink">{selected.email}</span></span><ArrowUpRight className="ml-auto size-4 shrink-0 text-ink-gray" /></a>}
                  {selected.phone && <a href={`tel:${selected.phone}`} className="flex min-w-0 items-center gap-3 rounded-2xl border border-border p-4 transition-colors hover:border-primary/35 hover:bg-brand-light/40"><Phone className="size-4 shrink-0 text-primary" /><span className="min-w-0"><span className="block text-[11px] uppercase tracking-wide text-tertiary">Phone</span><span className="mt-1 block truncate text-sm font-medium text-ink">{selected.phone}</span></span><ArrowUpRight className="ml-auto size-4 shrink-0 text-ink-gray" /></a>}
                </div>

                {(selected.productName || selected.pageUrl) && <div className="mt-6 border-t border-border pt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-tertiary">Page context</p>
                  {selected.productName && <p className="mt-2 text-sm font-medium text-ink">{selected.productName}</p>}
                  {selected.pageUrl && <a href={selected.pageUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-sm text-primary hover:underline">{selected.pageTitle || selected.pageUrl}<ArrowUpRight className="size-3.5 shrink-0" /></a>}
                </div>}

                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
                  <span className="flex items-center gap-2 text-xs text-tertiary"><Clock3 className="size-3.5" /> Reply consent captured</span>
                  <div className="flex gap-2">
                    {selected.status === "NEW" && <button type="button" disabled={saving} onClick={() => void updateStatus(selected, "REVIEWED")} className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-ink transition hover:bg-brand-light disabled:opacity-50"><Check className="size-4" /> Mark reviewed</button>}
                    {selected.status !== "CLOSED" && <button type="button" disabled={saving} onClick={() => void updateStatus(selected, "CLOSED")} className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-dark disabled:opacity-50"><X className="size-4" /> Close enquiry</button>}
                    {selected.status === "CLOSED" && <button type="button" disabled={saving} onClick={() => void updateStatus(selected, "NEW")} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink transition hover:bg-brand-light disabled:opacity-50">Reopen</button>}
                  </div>
                </div>
              </article>
            ) : <div className="hidden lg:block" />}
          </div>
        )}
      </section>
    </div>
  );
}
