export function isSarvamCreditsError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "status" in error && Number(error.status) === 402) return true;
  return error instanceof Error && /(?:Sarvam\s+\w+\s+failed:\s*)?\b402\b/.test(error.message);
}

export function mapTwilioCallError(code: string | undefined): string {
  if (code === "21215") return "India is not enabled in Twilio Voice Geo Permissions.";
  if (code === "21219" || code === "21210") return "That number is not verified on this Twilio trial account.";
  if (code === "13224" || code === "21217") return "This Twilio number cannot dial that destination.";
  if (code === "21608") return "The destination number must be verified on this Twilio trial account.";
  return "Twilio could not start the call. Check the destination number and Voice settings.";
}
