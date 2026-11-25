import { describe, expect, it } from "vitest";
import { getPublicBaseUrl, isE164, isWithinIndiaCallWindow, normalizeE164, publicUrlIfConfigured } from "../guards";

describe("outbound call guards", () => {
  it("accepts only normalized E.164 phone numbers", () => {
    expect(isE164("+919876543210")).toBe(true);
    expect(isE164("919876543210")).toBe(false);
    expect(isE164("+0123456789")).toBe(false);
    expect(normalizeE164("+91-98765-43210")).toBe("+919876543210");
  });

  it("uses the India local calling window, start-inclusive and end-exclusive", () => {
    expect(isWithinIndiaCallWindow(new Date("2026-01-01T03:30:00.000Z"))).toBe(true);
    expect(isWithinIndiaCallWindow(new Date("2026-01-01T03:29:00.000Z"))).toBe(false);
    expect(isWithinIndiaCallWindow(new Date("2026-01-01T15:30:00.000Z"))).toBe(false);
  });

  it("supports a full 24-hour window with 24:00 as end of day", () => {
    expect(isWithinIndiaCallWindow(new Date("2026-01-01T18:29:00.000Z"), "00:00", "24:00")).toBe(true);
    expect(isWithinIndiaCallWindow(new Date("2026-01-01T18:30:00.000Z"), "00:00", "24:00")).toBe(true);
    expect(isWithinIndiaCallWindow(new Date("2026-01-01T03:30:00.000Z"), "00:00", "24:00")).toBe(true);
    expect(isWithinIndiaCallWindow(new Date("2026-01-01T03:30:00.000Z"), "00:00", "24:01")).toBe(false);
  });

  it("accepts a configured public HTTPS URL and rejects local or insecure URLs", () => {
    const previous = process.env.PUBLIC_BASE_URL;
    process.env.PUBLIC_BASE_URL = "https://example-tunnel.trycloudflare.com";
    expect(getPublicBaseUrl()?.origin).toBe("https://example-tunnel.trycloudflare.com");
    process.env.PUBLIC_BASE_URL = "http://localhost:4000";
    expect(getPublicBaseUrl()).toBeNull();
    process.env.PUBLIC_BASE_URL = "https://127.0.0.1";
    expect(getPublicBaseUrl()).toBeNull();
    expect(publicUrlIfConfigured("/api/calls/call-1")).toBeUndefined();
    if (previous === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = previous;
  });
});
