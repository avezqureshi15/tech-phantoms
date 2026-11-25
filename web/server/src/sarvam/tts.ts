/**
 * Sarvam Text-to-Speech, REST API (BUILD-PLAN §3.3, §9). Returns base64
 * audio — decode before playback, per the docs.
 */

const TTS_URL = "https://api.sarvam.ai/text-to-speech";
const TTS_MODEL = "bulbul:v3";
const DEFAULT_SPEAKER = "shubh";

export interface SynthesizeResult {
  audioBase64: string;
  requestId: string | null;
}

export async function synthesizeSpeech(
  text: string,
  languageCode: string,
  opts: { speaker?: string } = {},
): Promise<SynthesizeResult> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new Error("SARVAM_API_KEY is not set");
  }

  const res = await fetch(TTS_URL, {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      language_code: languageCode,
      model: TTS_MODEL,
      speaker: opts.speaker ?? DEFAULT_SPEAKER,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Sarvam TTS failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { request_id: string | null; audios: string[] };

  if (data.audios.length > 1) {
    // Each element is base64 of what's likely a standalone WAV file with its
    // own header — naively joining the base64 strings would then produce an
    // invalid audio stream. We've only verified the single-chunk case live;
    // flag it loudly if a longer reply ever triggers multi-chunk output.
    console.warn(`Sarvam TTS returned ${data.audios.length} audio chunks — using only the first.`);
    return { audioBase64: data.audios[0], requestId: data.request_id };
  }

  return {
    audioBase64: data.audios[0] ?? "",
    requestId: data.request_id,
  };
}
