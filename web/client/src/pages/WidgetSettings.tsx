import { useEffect, useState, type FormEvent } from "react";
import { Check, Code2, Copy, ExternalLink, Plug, Save } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import type { WidgetInstallation } from "@/lib/types";

export default function WidgetSettings() {
  const { isTenantAdmin } = useAuth();
  const [widget, setWidget] = useState<WidgetInstallation | null>(null);
  const [origins, setOrigins] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [accentColor, setAccentColor] = useState("#B7503C");
  const [welcomeText, setWelcomeText] = useState("Have a question? Send us a note.");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isTenantAdmin) {
      return;
    }
    let cancelled = false;
    apiFetch<{ widget: WidgetInstallation | null }>("/api/tenant/widget")
      .then(({ widget: installation }) => {
        if (cancelled) return;
        setWidget(installation);
        setOrigins(installation?.allowedOrigins.join("\n") ?? "");
        setEnabled(installation?.enabled ?? true);
        setAccentColor(installation?.accentColor ?? "#B7503C");
        setWelcomeText(installation?.welcomeText ?? "Have a question? Send us a note.");
      })
      .catch(() => { if (!cancelled) setError("Couldn't load widget settings."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isTenantAdmin]);

  const apiBase = API_BASE_URL.replace(/\/$/, "");
  const snippet = widget ? `<script async src="${apiBase}/widget.js" data-widget-id="${widget.publicId}"></script>` : "";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const response = await apiFetch<{ widget: WidgetInstallation }>("/api/tenant/widget", {
        method: "PUT",
        body: JSON.stringify({
          enabled,
          allowedOrigins: origins.split(/\r?\n/).map((origin) => origin.trim()).filter(Boolean),
          accentColor,
          welcomeText,
        }),
      });
      setWidget(response.widget);
      setOrigins(response.widget.allowedOrigins.join("\n"));
      setSaved(true);
    } catch {
      setError("Add a valid origin such as https://shop.example.com before enabling the widget.");
    } finally {
      setSaving(false);
    }
  }

  async function copySnippet() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (!isTenantAdmin) return <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-8 text-center"><Plug className="mx-auto size-7 text-primary" /><h1 className="mt-4 font-heading text-2xl font-medium text-ink">Admin access required</h1><p className="mt-2 text-sm text-tertiary">Only a workspace admin can configure the public website widget.</p></div>;
  if (loading) return <div className="p-8 text-sm text-tertiary">Loading widget settings…</div>;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-7">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Channel setup</p>
        <h1 className="mt-2 font-heading text-4xl font-medium tracking-tight text-ink">Website widget</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-tertiary">Collect customer enquiries from your website with one small script. This version captures messages for your team; it does not send chat replies.</p>
      </header>

      {error && <p role="alert" className="rounded-xl border border-status-danger/25 bg-status-danger-bg px-4 py-3 text-sm text-status-danger">{error}</p>}
      {saved && <p role="status" className="rounded-xl border border-status-success/25 bg-status-success-bg px-4 py-3 text-sm text-status-success">Widget settings saved.</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.85fr)]">
        <form onSubmit={(event) => void save(event)} className="flex flex-col gap-6 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="font-heading text-xl font-medium text-ink">Installation settings</h2><p className="mt-1 text-sm text-tertiary">Set where the script is allowed to collect enquiries.</p></div>
            <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium text-ink">
              <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="size-4 accent-[#B7503C]" />
              Enabled
            </label>
          </div>

          <label className="flex flex-col gap-2 text-sm font-medium text-ink">
            Allowed website origins
            <textarea value={origins} onChange={(event) => setOrigins(event.target.value)} rows={4} placeholder={'https://shop.example.com\nhttps://www.shop.example.com'} className="resize-y rounded-2xl border border-border bg-background px-4 py-3 font-mono text-[13px] font-normal text-ink outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10" />
            <span className="text-xs font-normal leading-5 text-tertiary">One origin per line, including protocol. Paths and wildcards are not accepted. For the local demo, use <code className="rounded bg-brand-light px-1.5 py-0.5">http://localhost:5174</code>.</span>
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-ink">
            Welcome message
            <input value={welcomeText} maxLength={100} onChange={(event) => setWelcomeText(event.target.value)} className="rounded-2xl border border-border bg-background px-4 py-3 font-normal outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10" />
          </label>

          <label className="flex items-center gap-3 text-sm font-medium text-ink">
            <input type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} className="size-10 cursor-pointer rounded-xl border border-border bg-card p-1" />
            Widget accent color <span className="font-mono text-xs font-normal text-tertiary">{accentColor.toUpperCase()}</span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            {widget && <span className="text-xs text-tertiary">Public widget ID <code className="ml-1 rounded bg-brand-light px-1.5 py-1 text-ink">{widget.publicId}</code></span>}
            <button type="submit" disabled={saving} className="ml-auto inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink-dark disabled:opacity-50"><Save className="size-4" />{saving ? "Saving…" : "Save settings"}</button>
          </div>
        </form>

        <aside className="flex flex-col gap-5">
          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-brand-light text-primary"><Code2 className="size-5" /></span><div><h2 className="font-heading text-lg font-medium text-ink">Add Diya to your site</h2><p className="text-xs text-tertiary">One script. No SDK install.</p></div></div>
            {snippet ? (
              <>
                <pre className="mt-5 overflow-x-auto rounded-2xl bg-[#151a19] p-4 text-xs leading-6 text-[#f3d6a4]"><code>{snippet}</code></pre>
                <button type="button" onClick={() => void copySnippet()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-brand-light">{copied ? <Check className="size-4 text-status-success" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy install snippet"}</button>
              </>
            ) : <p className="mt-5 rounded-2xl bg-brand-light/70 p-4 text-sm leading-6 text-tertiary">Save your allowed website origin to create the installation ID and snippet.</p>}
            <p className="mt-4 text-xs leading-5 text-tertiary">The widget ID is public and only identifies your workspace. Never put a private API key in website code.</p>
          </section>

          <a href="http://localhost:5174" target="_blank" rel="noreferrer" className="group flex items-center justify-between gap-4 rounded-3xl border border-border bg-[#f4e9d8] p-5 transition hover:-translate-y-0.5 hover:shadow-md">
            <span><span className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#955c37]">Try the integration</span><span className="mt-1 block font-heading text-lg font-medium text-[#39261d]">Open the festive storefront demo</span></span><ExternalLink className="size-5 shrink-0 text-[#955c37] transition group-hover:translate-x-0.5" />
          </a>
        </aside>
      </div>
    </div>
  );
}
