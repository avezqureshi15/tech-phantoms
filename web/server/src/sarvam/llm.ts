import OpenAI from "openai";

/**
 * Sarvam Token Factory (BUILD-PLAN §3.3, §9) — OpenAI-compatible, so the
 * OpenAI SDK just needs a different base URL and model id. Tool-calling
 * works through the standard interface.
 *
 * Built lazily: the OpenAI SDK throws at construction time if it sees no
 * apiKey at all, and we don't want a missing SARVAM_API_KEY to crash the
 * whole server at import time — only the turns that actually need the LLM.
 */
let client: OpenAI | null = null;

export function getSarvamLLM(): OpenAI {
  if (client) return client;

  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new Error("SARVAM_API_KEY is not set");
  }

  client = new OpenAI({ apiKey, baseURL: "https://api.sarvam.ai/v2" });
  return client;
}

export const SARVAM_LLM_MODEL = process.env.SARVAM_LLM_MODEL ?? "sarvam-105b";
