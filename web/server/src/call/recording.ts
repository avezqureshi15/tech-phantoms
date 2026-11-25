const MAX_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 4_000;

export function getTwilioRecordingWavUrl(recordingUrl: string): string {
  const url = new URL(recordingUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !url.hostname.endsWith(".twilio.com")) {
    throw new Error("Twilio returned an invalid recording URL");
  }
  if (!url.pathname.endsWith(".wav")) url.pathname += ".wav";
  return url.toString();
}

export async function fetchTwilioRecording(
  recordingUrl: string,
  options: {
    accountSid: string;
    authToken: string;
    fetcher?: typeof fetch;
    wait?: (milliseconds: number) => Promise<void>;
  },
): Promise<Buffer> {
  const url = getTwilioRecordingWavUrl(recordingUrl);
  const fetcher = options.fetcher ?? fetch;
  const wait = options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetcher(url, {
        headers: { authorization: `Basic ${Buffer.from(`${options.accountSid}:${options.authToken}`).toString("base64")}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      if (response.status !== 404 || attempt === MAX_ATTEMPTS - 1) {
        throw new Error(`Twilio recording fetch failed with ${response.status}`);
      }
      lastError = new Error(`Twilio recording fetch failed with ${response.status}`);
    } catch (error) {
      if (attempt === MAX_ATTEMPTS - 1) throw error;
      lastError = error;
    }
    await wait(300);
  }
  throw lastError ?? new Error("Twilio recording was not available");
}
