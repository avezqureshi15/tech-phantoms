/**
 * Twilio trial accounts can only dial numbers verified in their console, so the
 * fictional numbers in the seed never connect. DEMO_VERIFIED_NUMBERS
 * (comma-separated E.164, set in the gitignored .env.local) replaces them.
 *
 * Real personal numbers must never be written into tracked code — this module
 * only ever reads them from the environment.
 *
 * DEVELOPMENT ONLY - NOT SECURE FOR PRODUCTION: when that variable is set the
 * seeder also records outbound-call consent for those customers so the demo is
 * one click. Production consent must always come from the customer.
 */
export function verifiedDemoNumbers(): string[] {
  return (process.env.DEMO_VERIFIED_NUMBERS ?? "")
    .split(",")
    .map((entry) => entry.trim().replace(/[\s().-]/g, ""))
    .filter((entry) => /^\+[1-9]\d{7,14}$/.test(entry));
}

export interface DemoContactOverride {
  phone?: string;
  outboundConsentAt?: Date;
  outboundConsentSource?: string;
  doNotCall?: boolean;
}

export function demoContactOverride(index: number): DemoContactOverride {
  const numbers = verifiedDemoNumbers();
  if (numbers.length === 0) return {};
  return {
    phone: numbers[index % numbers.length],
    outboundConsentAt: new Date(),
    outboundConsentSource: "Seeded demo consent via DEMO_VERIFIED_NUMBERS - development only",
    doNotCall: false,
  };
}
