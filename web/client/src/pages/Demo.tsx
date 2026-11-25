import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch, apiUpload } from "@/lib/api";
import { useAudioRecorder } from "@/lib/useAudioRecorder";
import { useAuth } from "@/auth/AuthProvider";
import type { Customer, DisplayMessage, VoiceTurnResponse, AgentActionSummary } from "@/lib/types";
import { PushToTalk } from "@/components/voice/PushToTalk";
import { Transcript } from "@/components/voice/Transcript";
import { ActionCard } from "@/components/voice/ActionCard";

const SAMPLE_CLIPS = [
  { label: "Sample 1 — late Diwali order", file: "sample-1.wav" },
  { label: "Sample 2 — wrong size kurta", file: "sample-2.wav" },
  { label: "Sample 3 — festive hamper refund", file: "sample-3.wav" },
];

const selectClass =
  "rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-ink outline-none transition focus:border-brand-lighter focus-visible:ring-4 focus-visible:ring-brand/10";

function playBase64Wav(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  void new Audio(url).play();
}

export default function Demo() {
  const { activeTenant, memberships, isSuperAdmin, switchTenant } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [ticketId, setTicketId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [lastAction, setLastAction] = useState<AgentActionSummary | null>(null);
  const [isThinking, setIsThinking] = useState(false);

  const tenantSlug = activeTenant?.slug ?? "";

  useEffect(() => {
    if (!tenantSlug) return;
    setTicketId(undefined);
    setMessages([]);
    setLastAction(null);
    apiFetch<{ customers: Customer[] }>("/api/console/customers")
      .then((data) => {
        setCustomers(data.customers);
        if (data.customers[0]) setCustomerId(data.customers[0].id);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Couldn't load customers for this workspace"));
  }, [tenantSlug]);

  const submitTurn = useCallback(
    async (blob: Blob, mimeType: string) => {
      if (!tenantSlug || !customerId) {
        toast.error("Pick a tenant and customer first");
        return;
      }
      setIsThinking(true);
      try {
        const form = new FormData();
        const extension = mimeType.includes("mp4") ? "mp4" : mimeType.includes("wav") ? "wav" : "webm";
        form.append("audio", blob, `audio.${extension}`);
        form.append("customerId", customerId);
        if (ticketId) form.append("ticketId", ticketId);

        const response = await apiUpload<VoiceTurnResponse>("/api/voice/turn", form);

        setTicketId(response.ticketId);
        setMessages((prev) => [
          ...prev,
          {
            id: `${response.ticketId}-c-${prev.length}`,
            role: "CUSTOMER",
            text: response.transcript,
            lang: response.detectedLang,
            latencyMs: response.latencyMs.stt,
          },
          {
            id: `${response.ticketId}-a-${prev.length}`,
            role: "AGENT",
            text: response.replyText,
            lang: response.detectedLang,
            latencyMs: response.latencyMs.llm,
            audioB64: response.replyAudioB64,
          },
        ]);
        setLastAction(response.action);
        if (response.replyAudioB64) playBase64Wav(response.replyAudioB64);
      } catch {
        toast.error("Soch raha hoon… but the voice turn failed. Check the server logs.");
      } finally {
        setIsThinking(false);
      }
    },
    [tenantSlug, customerId, ticketId],
  );

  const recorder = useAudioRecorder(submitTurn);

  async function playSampleClip(file: string) {
    try {
      const res = await fetch(`/samples/${file}`);
      // A missing file under /public falls through to Vite's SPA/HTML
      // fallback with a 200 — res.ok alone won't catch that.
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || contentType.includes("text/html")) {
        throw new Error("not found");
      }
      const blob = await res.blob();
      await submitTurn(blob, "audio/wav");
    } catch {
      toast.error(`${file} isn't recorded yet — drop it in client/public/samples/`);
    }
  }

  async function resetDemo() {
    try {
      await apiFetch("/api/demo/reset", { method: "POST" });
      setTicketId(undefined);
      setMessages([]);
      setLastAction(null);
      toast.success("Demo data reset");
    } catch {
      toast.error("Reset failed — is the server/database up?");
    }
  }

  return (
    <div className="brand-glow min-h-svh bg-background">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-sm">D</span>
            <div>
              <h1 className="font-heading text-xl font-medium tracking-tight text-ink">Diya</h1>
              <p className="text-xs text-tertiary">Voice agent sandbox</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="rounded-full bg-brand-light px-3 py-1.5 text-sm font-medium text-primary">{activeTenant?.name ?? "No workspace"}</span>
            {memberships.length > 1 && (
              <select
                value={tenantSlug}
                onChange={(event) => {
                  const slug = event.target.value;
                  void switchTenant(slug);
                }}
                className={selectClass}
              >
                {memberships.map((membership) => (
                  <option key={membership.tenantId} value={membership.tenantSlug}>
                    {membership.tenantName}
                  </option>
                ))}
              </select>
            )}
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className={selectClass}
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </header>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col items-center gap-4">
            <PushToTalk
              isReady={recorder.isReady}
              isRecording={recorder.isRecording}
              level={recorder.level}
              onStart={recorder.start}
              onStop={recorder.stop}
            />
            {recorder.error && <p className="text-sm text-status-danger">{recorder.error}</p>}

            <div className="flex flex-wrap items-center justify-center gap-3">
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) void playSampleClip(e.target.value);
                  e.target.value = "";
                }}
                className={selectClass}
              >
                <option value="" disabled>
                  Play sample clip…
                </option>
                {SAMPLE_CLIPS.map((s) => (
                  <option key={s.file} value={s.file}>
                    {s.label}
                  </option>
                ))}
              </select>
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={resetDemo}
                  className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-ink shadow-sm transition-colors hover:border-brand-lighter hover:bg-brand-light"
                >
                  Reset demo
                </button>
              )}
            </div>
          </div>

          {isThinking && <p className="mt-4 text-center text-sm text-primary italic">Soch raha hoon…</p>}
        </section>

        <Transcript messages={messages} />

        <ActionCard action={lastAction} />
      </div>
    </div>
  );
}
