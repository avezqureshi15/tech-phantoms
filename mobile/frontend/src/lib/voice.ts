/** Dictated words appended to what was already typed, with one space between and no stray whitespace. */
export function mergeTranscript(typed: string, spoken: string): string {
  const said = spoken.trim();
  if (!said) return typed;
  const before = typed.trimEnd();
  return before ? `${before} ${said}` : said;
}

export const MAX_RECORDING_SECONDS = 30; // the speech service's limit for one clip

export const PERMISSION_MESSAGE = "Allow the microphone in Settings to talk to Utsav.";
export const RECORDING_FAILED = "The microphone isn't available right now. You can type instead.";
export const UPLOAD_FAILED = "Voice didn't work that time. You can type instead.";
