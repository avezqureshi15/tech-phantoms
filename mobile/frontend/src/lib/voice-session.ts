import type { Item } from "@/lib/utsav/schemas";
import { safeUrl } from "@/lib/utsav/markdown";

/** Where a voice session is: whose turn it is to speak. */
export type Phase = "idle" | "speaking" | "listening" | "thinking" | "paused" | "ended" | "error";

// ---- knowing when someone has finished speaking -----------------------------------------------------
// The microphone reports its level in decibels (0 is the loudest, quiet rooms sit near -60). Speech is
// louder than the room; the person has finished when it has been quiet for a moment after they spoke.
export const SPEECH_DB = -38;
export const SILENCE_MS = 1800; // an elder's pause between words is long: do not cut them off
export const NO_SPEECH_MS = 12_000; // nobody said anything: stop waiting
export const MAX_LISTEN_MS = 28_000; // the transcription service takes clips up to 30 seconds

/** The microphone's decibel reading as 0 (a quiet room) to 1 (loud speech), for drawing the voice. */
export function meterLevel(db: number | undefined): number {
  if (db === undefined || Number.isNaN(db)) return 0;
  const quiet = -55; // below this is the room, not a person
  return Math.min(1, Math.max(0, (db - quiet) / (-10 - quiet)));
}

export type Vad = { startedAt: number; heardSpeech: boolean; lastLoud: number };
export type VadAction = "continue" | "finish" | "giveup";

export const vadStart = (now: number): Vad => ({ startedAt: now, heardSpeech: false, lastLoud: now });

export function vadStep(vad: Vad, level: number | undefined, now: number): { vad: Vad; action: VadAction } {
  const loud = level !== undefined && level > SPEECH_DB;
  const next: Vad = loud ? { ...vad, heardSpeech: true, lastLoud: now } : vad;

  if (now - next.startedAt >= MAX_LISTEN_MS) return { vad: next, action: next.heardSpeech ? "finish" : "giveup" };
  if (next.heardSpeech && now - next.lastLoud >= SILENCE_MS) return { vad: next, action: "finish" };
  if (!next.heardSpeech && now - next.startedAt >= NO_SPEECH_MS) return { vad: next, action: "giveup" };
  return { vad: next, action: "continue" };
}

// ---- what is said aloud ---------------------------------------------------------------------------------
/** The words only: no Markdown marks, links or emoji, ready for a voice. (The server cleans it again.) */
export function forSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/[*`~]+|__+/g, "") // emphasis marks vanish without leaving a gap
    .replace(/[|#>]+/g, " ")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Everything Utsav said in a turn, as one string to speak and to show. */
export function replyText(items: Item[]): string {
  return items
    .flatMap((item) => (item.type === "text" ? [item.text] : []))
    .map(forSpeech)
    .filter(Boolean)
    .join(" ");
}

/** The address to open when Utsav was asked to play something: YouTube first, as it needs no account. */
export function musicLink(items: Item[]): string | null {
  for (const item of items) {
    if (item.type !== "card" || item.card.kind !== "links") continue;
    const links = item.card.links.filter((link) => link.label.startsWith("Play on"));
    const preferred = links.find((link) => link.label.includes("YouTube")) ?? links[0];
    const url = preferred ? safeUrl(preferred.url) : null;
    if (url) return url;
  }
  return null;
}

// ---- what the screen says at each moment -----------------------------------------------------------------
export type Guidance = { title: string; hint: string; step: 0 | 1 | 2 | null };

/** One short headline and one plain instruction per phase, and which of the three steps is current. */
export function guidance(phase: Phase, startText: string): Guidance {
  switch (phase) {
    case "idle":
      return { title: startText, hint: "", step: null };
    case "speaking":
      return { title: "Utsav is speaking", hint: "Tap the circle to answer now", step: 0 };
    case "listening":
      return { title: "Your turn. Speak now", hint: "I will stop listening when you pause", step: 1 };
    case "thinking":
      return { title: "One moment…", hint: "", step: 2 };
    case "paused":
      return { title: "Tap when you are ready", hint: "", step: null };
    case "ended":
      return { title: "Goodbye", hint: "", step: null };
    case "error":
      return { title: "Tap to try again", hint: "", step: null };
  }
}

/** Longer replies get smaller type so they fit, and every reply scrolls, so nothing is ever cut off. */
export function captionSize(text: string): { fontSize: number; lineHeight: number } {
  const length = text.length;
  if (length <= 90) return { fontSize: 32, lineHeight: 44 };
  if (length <= 220) return { fontSize: 27, lineHeight: 38 };
  if (length <= 500) return { fontSize: 23, lineHeight: 33 };
  return { fontSize: 20, lineHeight: 30 };
}
