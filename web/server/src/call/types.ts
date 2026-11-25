export interface CallChannel {
  readonly name: "twilio" | "browser";
  place(input: {
    to: string;
    from: string;
    voiceUrl: string;
    statusCallbackUrl: string;
    timeLimitSeconds: number;
  }): Promise<{ providerSid?: string }>;
  end(providerSid: string): Promise<void>;
}
