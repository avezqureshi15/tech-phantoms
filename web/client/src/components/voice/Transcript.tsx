import { useRef } from "react";
import type { DisplayMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

function base64ToAudioUrl(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
}

function TranscriptBubble({ message }: { message: DisplayMessage }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isCustomer = message.role === "CUSTOMER";

  function replay() {
    if (!message.audioB64) return;
    const audio = new Audio(base64ToAudioUrl(message.audioB64));
    audioRef.current = audio;
    void audio.play();
  }

  return (
    <div className={cn("flex", isCustomer ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-md rounded-2xl border px-4 py-3 text-base shadow-sm",
          isCustomer ? "border-border bg-brand-light/70 text-ink" : "border-border bg-card text-ink",
        )}
      >
        <div className="mb-1 flex items-center gap-2 font-heading text-xs font-medium tracking-wide text-tertiary uppercase">
          <span>{isCustomer ? "Customer" : "Diya"}</span>
          {message.lang && <span className="rounded-full bg-mint px-2 py-0.5 text-primary normal-case">{message.lang}</span>}
          {message.latencyMs != null && <span>{(message.latencyMs / 1000).toFixed(1)}s</span>}
          {message.audioB64 && (
            <button type="button" onClick={replay} className="text-primary normal-case underline underline-offset-2">
              replay
            </button>
          )}
        </div>
        <p className="leading-relaxed">{message.text}</p>
      </div>
    </div>
  );
}

export function Transcript({ messages }: { messages: DisplayMessage[] }) {
  return (
    <div className="flex flex-col gap-3 text-[1.0625rem]">
      {messages.map((m) => (
        <TranscriptBubble key={m.id} message={m} />
      ))}
    </div>
  );
}
