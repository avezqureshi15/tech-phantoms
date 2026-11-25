import type { Item } from "@/lib/utsav/schemas";
import { safeUrl } from "@/lib/utsav/markdown";

/** Where a voice session is: whose turn it is to speak. */
export type Phase = "idle" | "speaking" | "listening" | "thinking" | "paused" | "ended" | "error";

// ---- knowing when someone has finished speaking -----------------------------------------------------
// The microphone reports its level in decibels (0 is the loudest, quiet rooms sit near -60). Speech is
// louder than the room, but rooms differ: a kitchen or a street sits far above a quiet bedroom. So the
// first half-second is spent learning how loud *this* room is, and speech means "clearly louder than
// that". The person has finished when it has been quiet for a moment after they spoke, and that moment
// is longer for short, hesitant answers and for prayers, where people pause between words.
export const SPEECH_DB = -38; // used until the room has been measured
export const CALIBRATE_MS = 500;
export const NOISE_MARGIN_DB = 14; // how far above the room's own level counts as speech
export const THRESHOLD_MIN_DB = -50;
export const THRESHOLD_MAX_DB = -24; // even in a loud room, a voice close to the phone clears this
export const SILENCE_MS = 1500; // a normal pause between sentences
export const SHORT_UTTERANCE_MS = 1500; // a short answer may be someone still thinking
export const SHORT_BONUS_MS = 600;
export const RECITE_BONUS_MS = 900; // prayers are said slowly, with breaths between lines
export const NO_SPEECH_MS = 12_000; // nobody said anything: stop waiting
export const MAX_LISTEN_MS = 28_000; // the transcription service takes clips up to 30 seconds
const OBVIOUS_SPEECH_DB = -25; // loud enough to be a voice even before the room is measured

/** The microphone's decibel reading as 0 (a quiet room) to 1 (loud speech), for drawing the voice. */
export function meterLevel(db: number | undefined): number {
  if (db === undefined || Number.isNaN(db)) return 0;
  const quiet = -55; // below this is the room, not a person
  return Math.min(1, Math.max(0, (db - quiet) / (-10 - quiet)));
}

export type Vad = {
  startedAt: number;
  heardSpeech: boolean;
  firstLoud: number | null;
  lastLoud: number;
  samples: number[]; // the first half-second, to learn the room
  threshold: number; // above this is speech
  calibrated: boolean;
};
export type VadAction = "continue" | "finish" | "giveup";

export const vadStart = (now: number): Vad => ({
  startedAt: now,
  heardSpeech: false,
  firstLoud: null,
  lastLoud: now,
  samples: [],
  threshold: SPEECH_DB,
  calibrated: false,
});

/** The quiet end of what was heard (speech is loud, so it barely moves this), plus a margin. */
export function thresholdFor(samples: number[]): number {
  if (samples.length === 0) return SPEECH_DB;
  const sorted = [...samples].sort((a, b) => a - b);
  const floor = sorted[Math.floor((sorted.length - 1) * 0.2)]!;
  return Math.min(THRESHOLD_MAX_DB, Math.max(THRESHOLD_MIN_DB, floor + NOISE_MARGIN_DB));
}

/** How long a quiet spell must last before the turn is over. */
export function silenceNeeded(vad: Vad, extraMs = 0): number {
  const spoke = vad.firstLoud === null ? 0 : vad.lastLoud - vad.firstLoud;
  return SILENCE_MS + (spoke < SHORT_UTTERANCE_MS ? SHORT_BONUS_MS : 0) + extraMs;
}

export function vadStep(
  vad: Vad,
  level: number | undefined,
  now: number,
  extraPauseMs = 0,
): { vad: Vad; action: VadAction } {
  let next = vad;
  const calibrating = !next.calibrated && now - next.startedAt < CALIBRATE_MS;
  if (calibrating && level !== undefined) next = { ...next, samples: [...next.samples, level] };
  if (!next.calibrated && !calibrating) {
    next = { ...next, calibrated: true, threshold: thresholdFor(next.samples), samples: [] };
  }

  const loud = level !== undefined && level > (calibrating ? OBVIOUS_SPEECH_DB : next.threshold);
  if (loud) next = { ...next, heardSpeech: true, lastLoud: now, firstLoud: next.firstLoud ?? now };

  if (now - next.startedAt >= MAX_LISTEN_MS) return { vad: next, action: next.heardSpeech ? "finish" : "giveup" };
  if (next.heardSpeech && now - next.lastLoud >= silenceNeeded(next, extraPauseMs))
    return { vad: next, action: "finish" };
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

/** Whether a tap on the circle means anything. While Utsav speaks or listens the conversation runs by
 * itself, so nothing is asked of the person; a tap is only for starting again after a pause or a problem. */
export function circleIsTappable(phase: Phase): boolean {
  return phase === "idle" || phase === "paused" || phase === "error";
}

/** One short headline and one plain instruction per phase, and which of the three steps is current. */
export function guidance(phase: Phase, startText: string): Guidance {
  switch (phase) {
    case "idle":
      return { title: startText, hint: "", step: null };
    case "speaking":
      return { title: "Utsav is speaking", hint: "I will listen as soon as I finish", step: 0 };
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
