/**
 * The FestiveOS mobile backend asks for a customer to be called back (POST /api/integrations/support-requests).
 *
 * This file holds the two decisions that must never be wrong, as pure functions with no database or
 * network so they can be tested exhaustively:
 *   1. Did this request really come from FestiveOS, and is it fresh? (HMAC signature + time window)
 *   2. Is what it asks for something we are allowed to act on? (strict validation, explicit consent)
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const CATEGORY = "festiveos_support";
export const CONSENT_SOURCE = "festiveos_app";
export const TOLERANCE_SECONDS = 300; // a signed request is only good for five minutes
const MAX_CONSENT_AGE_MS = 24 * 3600 * 1000;
const FUTURE_SLACK_MS = 5 * 60 * 1000;

export const LANGUAGES = [
  "en-IN", "hi-IN", "kn-IN", "ta-IN", "te-IN", "ml-IN", "mr-IN", "bn-IN", "gu-IN", "pa-IN", "od-IN",
] as const;
export const TOPICS = ["expense_dispute", "group_help", "account_access", "app_problem", "other"] as const;

/** The signature the mobile backend computes: HMAC-SHA256 of `<timestamp>.<exact body>`, in hex. */
export function sign(secret: string, timestamp: string, body: Buffer | string): string {
  return createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest("hex");
}

export type SignatureResult = "ok" | "missing" | "stale" | "bad";

export function verifySignature(input: {
  secret: string;
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: Buffer | undefined;
  nowSeconds: number;
}): SignatureResult {
  const { secret, timestamp, signature, rawBody, nowSeconds } = input;
  if (!timestamp || !signature || !rawBody) return "missing";
  if (!/^[0-9]{9,12}$/.test(timestamp)) return "bad";
  if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) return "stale";
  const expected = Buffer.from(sign(secret, timestamp, rawBody), "hex");
  const given = /^[0-9a-f]{64}$/i.test(signature) ? Buffer.from(signature, "hex") : null;
  // Same length first (timingSafeEqual throws otherwise), then constant-time comparison.
  if (!given || given.length !== expected.length) return "bad";
  return timingSafeEqual(given, expected) ? "ok" : "bad";
}

export interface SupportRequest {
  requestId: string;
  externalUserId: string;
  name: string;
  phone: string;
  preferredLang: (typeof LANGUAGES)[number];
  consentAt: Date;
  consentVersion: string;
  topic: (typeof TOPICS)[number];
  issueSummary: string;
}

export type ParseResult = { ok: true; value: SupportRequest } | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, min: number, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
};

export function parseSupportRequest(body: unknown, now: Date = new Date()): ParseResult {
  if (!isRecord(body)) return { ok: false, error: "body must be a JSON object" };
  const consent = body.consent;
  if (!isRecord(consent)) return { ok: false, error: "consent is required" };

  const requestId = text(body.requestId, 8, 64);
  if (!requestId || !/^[A-Za-z0-9_-]+$/.test(requestId)) return { ok: false, error: "requestId is invalid" };
  const externalUserId = text(body.externalUserId, 1, 64);
  if (!externalUserId) return { ok: false, error: "externalUserId is invalid" };
  const name = text(body.name, 1, 120);
  if (!name) return { ok: false, error: "name is invalid" };
  if (typeof body.phone !== "string" || !/^\+[1-9][0-9]{7,14}$/.test(body.phone)) {
    return { ok: false, error: "phone must be E.164, like +919876543210" };
  }
  const preferredLang = LANGUAGES.find((l) => l === body.preferredLang);
  if (!preferredLang) return { ok: false, error: "preferredLang is not supported" };
  const topic = TOPICS.find((t) => t === body.topic);
  if (!topic) return { ok: false, error: "topic is not supported" };
  if (body.category !== CATEGORY) return { ok: false, error: "category is not supported" };
  const issueSummary = text(body.issueSummary, 1, 400);
  if (!issueSummary) return { ok: false, error: "issueSummary is invalid" };

  // Consent is the whole point: it must name this app, carry a version and a believable, recent time.
  if (consent.source !== CONSENT_SOURCE) return { ok: false, error: "consent.source is not accepted" };
  const consentVersion = text(consent.version, 1, 16);
  if (!consentVersion) return { ok: false, error: "consent.version is required" };
  const consentAt = typeof consent.at === "string" ? new Date(consent.at) : null;
  if (!consentAt || Number.isNaN(consentAt.getTime())) return { ok: false, error: "consent.at is invalid" };
  const age = now.getTime() - consentAt.getTime();
  if (age > MAX_CONSENT_AGE_MS || age < -FUTURE_SLACK_MS) return { ok: false, error: "consent.at is out of range" };

  return {
    ok: true,
    value: { requestId, externalUserId, name, phone: body.phone, preferredLang, consentAt, consentVersion, topic, issueSummary },
  };
}
