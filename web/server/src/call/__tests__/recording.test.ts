import { describe, expect, it, vi } from "vitest";
import { fetchTwilioRecording, getTwilioRecordingWavUrl } from "../recording";

describe("Twilio recording retrieval", () => {
  it("normalizes the recording to WAV and rejects non-Twilio URLs", () => {
    expect(getTwilioRecordingWavUrl("https://api.twilio.com/recordings/RE123"))
      .toBe("https://api.twilio.com/recordings/RE123.wav");
    expect(() => getTwilioRecordingWavUrl("https://example.com/recording"))
      .toThrow("invalid recording URL");
    expect(() => getTwilioRecordingWavUrl("http://api.twilio.com/recording"))
      .toThrow("invalid recording URL");
  });

  it("retries 404 twice with 300ms backoff and authenticates the media request", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(Buffer.from("RIFF-WAVE"), { status: 200 }));
    const wait = vi.fn(async () => undefined);

    const audio = await fetchTwilioRecording("https://api.twilio.com/recordings/RE123", {
      accountSid: "AC123",
      authToken: "secret",
      fetcher,
      wait,
    });

    expect(audio.toString()).toBe("RIFF-WAVE");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[300], [300]]);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.twilio.com/recordings/RE123.wav");
    expect((fetcher.mock.calls[0]?.[1]?.headers as Record<string, string>).authorization)
      .toBe(`Basic ${Buffer.from("AC123:secret").toString("base64")}`);
  });
});
