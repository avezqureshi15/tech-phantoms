/**
 * Guard rails for a spoken conversation. A voice loop listens, pays for transcription and a model
 * answer every turn, and nobody is watching the screen, so it needs limits a typed chat does not:
 * it must not answer its own voice, must not retry silence for ever, and must not run unattended.
 */

export const MAX_IDLE_TURNS = 3; // turns in a row with nothing usable heard, then wait for a tap
export const MAX_TURNS = 30; // one sitting; plenty for a prayer, bounded for cost
export const MAX_SESSION_MS = 20 * 60_000;
export const ECHO_TAIL_MS = 700; // the speaker's tail must fade before the microphone opens
export const ECHO_OVERLAP = 0.8;

export const IDLE_LIMIT_MESSAGE = "I could not hear you. I will wait. Tap when you are ready.";
export const SESSION_LIMIT_MESSAGE = "Let us rest here for now. You can start again whenever you like.";

const MARKS = /[\p{P}\p{S}।॥]/gu; // punctuation, symbols and the danda marks

export function wordsOf(text: string): string[] {
  return text.toLowerCase().replace(MARKS, " ").split(/\s+/).filter(Boolean);
}

/** Nothing worth sending: empty, or only punctuation or a stray sound. */
export function isNoise(heard: string): boolean {
  const words = wordsOf(heard);
  return words.length === 0 || words.join("").length < 2;
}

/**
 * The microphone picked up what the phone just said. True when almost every word heard was in what
 * Utsav said, and the person added little of their own. (Speech recognition can write a language in
 * another script, in which case the words differ and this cannot tell; the short tail wait before
 * listening is the first defence, this is the second.)
 */
export function isEcho(heard: string, spoken: string): boolean {
  const said = new Set(wordsOf(spoken));
  const words = wordsOf(heard);
  if (words.length === 0 || said.size === 0) return false;
  const shared = words.filter((word) => said.has(word)).length;
  return shared / words.length >= ECHO_OVERLAP && words.length <= said.size * 1.2;
}

export type Budget = { turns: number; startedAt: number };

/** Whether this sitting has used up its turns or its time. */
export function overBudget(budget: Budget, now: number): boolean {
  if (budget.startedAt === 0) return false; // not started yet
  return budget.turns >= MAX_TURNS || now - budget.startedAt >= MAX_SESSION_MS;
}
