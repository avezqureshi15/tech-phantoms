import { afterEach, describe, expect, it } from "vitest";
import { closeCallResponse, holdingResponse, playAndHangup, playAndRecord } from "../twiml";

const previousBaseUrl = process.env.PUBLIC_BASE_URL;

afterEach(() => {
  if (previousBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = previousBaseUrl;
});

describe("fallback TwiML", () => {
  it("uses a Hindi-capable Google voice in every Say fallback", () => {
    process.env.PUBLIC_BASE_URL = "https://diya-test.trycloudflare.com";
    const xml = [
      playAndRecord("session-1", null, "fallback"),
      playAndHangup(null, "fallback"),
      holdingResponse("session-1"),
      closeCallResponse("fallback"),
    ].join("\n");

    expect(xml.match(/voice="Google\.hi-IN-Standard-A"/g)).toHaveLength(5);
  });
});
