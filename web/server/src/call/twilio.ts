import twilio from "twilio";
import type { Request } from "express";
import type { CallChannel } from "./types";
import { getPublicBaseUrl } from "./guards";

export class TwilioCallChannel implements CallChannel {
  readonly name = "twilio" as const;

  private client() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) throw new Error("Twilio credentials are not configured");
    return twilio(accountSid, authToken);
  }

  async place(input: {
    to: string;
    from: string;
    voiceUrl: string;
    statusCallbackUrl: string;
    timeLimitSeconds: number;
  }): Promise<{ providerSid?: string }> {
    const call = await this.client().calls.create({
      to: input.to,
      from: input.from,
      url: input.voiceUrl,
      method: "POST",
      statusCallback: input.statusCallbackUrl,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      timeLimit: input.timeLimitSeconds,
      machineDetection: "Enable",
    });
    return { providerSid: call.sid };
  }

  async end(providerSid: string): Promise<void> {
    await this.client().calls(providerSid).update({ status: "completed" });
  }
}

export function validateTwilioWebhook(req: Request): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.header("X-Twilio-Signature");
  const base = getPublicBaseUrl();
  if (!authToken || !signature || !base) return false;

  const canonicalUrl = `${base.origin}${req.originalUrl}`;
  try {
    return twilio.validateRequest(authToken, signature, canonicalUrl, req.body ?? {});
  } catch {
    return false;
  }
}
