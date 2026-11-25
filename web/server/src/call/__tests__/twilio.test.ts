import twilio from "twilio";
import type { Request } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { validateTwilioWebhook } from "../twilio";

const originalBaseUrl = process.env.PUBLIC_BASE_URL;
const originalAuthToken = process.env.TWILIO_AUTH_TOKEN;

afterEach(() => {
  if (originalBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = originalBaseUrl;
  if (originalAuthToken === undefined) delete process.env.TWILIO_AUTH_TOKEN;
  else process.env.TWILIO_AUTH_TOKEN = originalAuthToken;
});

describe("validateTwilioWebhook", () => {
  it("validates the signature against the configured public URL and parsed form fields", () => {
    process.env.PUBLIC_BASE_URL = "https://diya-test.trycloudflare.com";
    process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
    const originalUrl = "/api/twilio/voice/session-1";
    const body = { CallSid: "CA123", AnsweredBy: "human" };
    const signature = twilio.getExpectedTwilioSignature(
      process.env.TWILIO_AUTH_TOKEN,
      `https://diya-test.trycloudflare.com${originalUrl}`,
      body,
    );
    const req = {
      originalUrl,
      body,
      header: (name: string) => name.toLowerCase() === "x-twilio-signature" ? signature : undefined,
    } as unknown as Request;

    expect(validateTwilioWebhook(req)).toBe(true);
    req.body.AnsweredBy = "machine_start";
    expect(validateTwilioWebhook(req)).toBe(false);
  });

  it("rejects signatures when the public base URL is missing", () => {
    delete process.env.PUBLIC_BASE_URL;
    process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
    const req = {
      originalUrl: "/api/twilio/status/session-1",
      body: { CallStatus: "completed" },
      header: () => "signature",
    } as unknown as Request;
    expect(validateTwilioWebhook(req)).toBe(false);
  });
});
