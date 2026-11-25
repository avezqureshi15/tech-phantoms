import { describe, expect, it } from "vitest";
import { isSarvamCreditsError, mapTwilioCallError } from "../errors";

describe("isSarvamCreditsError", () => {
  it("recognizes a Sarvam 402 from REST errors and SDK status", () => {
    expect(isSarvamCreditsError(new Error("Sarvam TTS failed: 402 insufficient credits"))).toBe(true);
    expect(isSarvamCreditsError({ status: 402 })).toBe(true);
    expect(isSarvamCreditsError(new Error("Sarvam STT failed: 429 too many requests"))).toBe(false);
  });

  it("maps common Twilio call failures to operator-friendly messages", () => {
    expect(mapTwilioCallError("21215")).toContain("Geo Permissions");
    expect(mapTwilioCallError("21219")).toContain("verified");
    expect(mapTwilioCallError("unknown")).toContain("Voice settings");
  });
});
