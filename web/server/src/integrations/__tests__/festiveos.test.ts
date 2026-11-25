import { describe, expect, it } from "vitest";
import { CATEGORY, TOLERANCE_SECONDS, parseSupportRequest, sign, verifySignature } from "../festiveos";

const SECRET = "s3cret";
const NOW = 1_700_000_000;
const body = Buffer.from('{"phone":"+919876543210","name":"विक्रम"}');

const check = (over: Partial<Parameters<typeof verifySignature>[0]> = {}) =>
  verifySignature({
    secret: SECRET,
    timestamp: String(NOW),
    signature: sign(SECRET, String(NOW), body),
    rawBody: body,
    nowSeconds: NOW,
    ...over,
  });

describe("signature", () => {
  it("matches the signature the mobile backend (Python) computes for the same input", () => {
    // The same vector is asserted in mobile/backend/tests/test_support.py.
    expect(sign(SECRET, "1700000000", body)).toBe("c9fde37d86c5f8ec2f973a9168433eb33ea197600d705b7089f47d9283c2d374");
  });

  it("accepts a correct, fresh signature", () => {
    expect(check()).toBe("ok");
  });

  it("rejects a body that was changed after signing", () => {
    expect(check({ rawBody: Buffer.from('{"phone":"+919999999999","name":"विक्रम"}') })).toBe("bad");
  });

  it("rejects a signature made with another secret", () => {
    expect(check({ signature: sign("other", String(NOW), body) })).toBe("bad");
  });

  it("rejects a replayed request outside the five-minute window, in either direction", () => {
    expect(check({ nowSeconds: NOW + TOLERANCE_SECONDS + 1 })).toBe("stale");
    expect(check({ nowSeconds: NOW - TOLERANCE_SECONDS - 1 })).toBe("stale");
    expect(check({ nowSeconds: NOW + TOLERANCE_SECONDS })).toBe("ok");
  });

  it("cannot be tricked by moving the timestamp, because the time is part of what is signed", () => {
    const later = String(NOW + 100);
    expect(check({ timestamp: later, nowSeconds: NOW + 100 })).toBe("bad");
  });

  it.each([undefined, ""])("treats a missing header (%p) as missing", (value) => {
    expect(check({ signature: value })).toBe("missing");
    expect(check({ timestamp: value })).toBe("missing");
  });

  it("treats a missing body as missing", () => {
    expect(check({ rawBody: undefined })).toBe("missing");
  });

  it.each(["abc", "zz".repeat(32), "0".repeat(63), "0".repeat(65), "'; DROP TABLE--"])(
    "never throws on a malformed signature (%p)",
    (signature) => {
      expect(check({ signature })).toBe("bad");
    },
  );

  it("rejects a non-numeric timestamp", () => {
    expect(check({ timestamp: "yesterday" })).toBe("bad");
  });
});

const valid = (over: Record<string, unknown> = {}) => ({
  requestId: "7f3c2a1e-9b4d-4f6a-8c1d-2e5b7a9c0d11",
  externalUserId: "7355b4d2-95a1-4cc9-81f2-abd7b50afa79",
  name: "Vikram",
  phone: "+919876543210",
  preferredLang: "kn-IN",
  consent: { at: new Date(NOW * 1000 - 60_000).toISOString(), source: "festiveos_app", version: "2026-11" },
  category: CATEGORY,
  topic: "expense_dispute",
  issueSummary: "Expense dispute: wrong split",
  ...over,
});
const now = new Date(NOW * 1000);

describe("support request", () => {
  it("accepts a complete request with consent", () => {
    const result = parseSupportRequest(valid(), now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.phone).toBe("+919876543210");
      expect(result.value.preferredLang).toBe("kn-IN");
      expect(result.value.consentAt).toBeInstanceOf(Date);
    }
  });

  it.each([
    ["no consent", { consent: undefined }],
    ["consent from another source", { consent: { at: new Date(NOW * 1000).toISOString(), source: "console", version: "1" } }],
    ["consent without a version", { consent: { at: new Date(NOW * 1000).toISOString(), source: "festiveos_app" } }],
    ["consent with a bad time", { consent: { at: "tomorrow-ish", source: "festiveos_app", version: "1" } }],
    ["consent from days ago", { consent: { at: new Date(NOW * 1000 - 3 * 86_400_000).toISOString(), source: "festiveos_app", version: "1" } }],
    ["consent from the future", { consent: { at: new Date(NOW * 1000 + 3_600_000).toISOString(), source: "festiveos_app", version: "1" } }],
    ["a phone without a country code", { phone: "9876543210" }],
    ["a phone with letters", { phone: "+91CALLME123" }],
    ["an unsupported language", { preferredLang: "xx-XX" }],
    ["an unknown topic", { topic: "refund" }],
    ["another category", { category: "refund_request" }],
    ["an empty name", { name: "   " }],
    ["a very long summary", { issueSummary: "x".repeat(401) }],
    ["a request id with odd characters", { requestId: "../../etc/passwd" }],
    ["a request id that is too short", { requestId: "abc" }],
  ])("refuses %s", (_label, change) => {
    expect(parseSupportRequest(valid(change as Record<string, unknown>), now).ok).toBe(false);
  });

  it.each([null, undefined, "text", 42, [], [valid()]])("refuses a body that is not an object (%p)", (input) => {
    expect(parseSupportRequest(input, now).ok).toBe(false);
  });

  it("trims what people typed", () => {
    const result = parseSupportRequest(valid({ name: "  Vikram  ", issueSummary: "  hi  " }), now);
    expect(result.ok && result.value.name).toBe("Vikram");
    expect(result.ok && result.value.issueSummary).toBe("hi");
  });
});
