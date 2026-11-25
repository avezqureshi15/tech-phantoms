/**
 * Sarvam Speech-to-Text, REST API (BUILD-PLAN §3.3, §9). Raw fetch, not the
 * `sarvamai` SDK — the plan flags a doc inconsistency on the SDK's
 * constructor arg and language param, and we have no live key to verify
 * against. The REST contract below was confirmed against Sarvam's docs.
 */

const STT_URL = "https://api.sarvam.ai/speech-to-text";
const STT_MODEL = "saaras:v3";

export interface TranscribeResult {
  transcript: string;
  languageCode: string | null;
  requestId: string | null;
}

export async function transcribeAudio(
  audio: Buffer,
  opts: { mimeType?: string } = {},
): Promise<TranscribeResult> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new Error("SARVAM_API_KEY is not set");
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(audio)], { type: opts.mimeType ?? "audio/webm" }),
    "audio.webm",
  );
  form.append("model", STT_MODEL);
  form.append("mode", "transcribe");
  form.append("language_code", "unknown"); // auto-detect Hinglish/Hindi/English

  const res = await fetch(STT_URL, {
    method: "POST",
    headers: { "api-subscription-key": apiKey },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Sarvam STT failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as {
    request_id: string | null;
    transcript: string;
    language_code: string | null;
  };

  return {
    transcript: data.transcript,
    languageCode: data.language_code,
    requestId: data.request_id,
  };
}
