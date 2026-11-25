import { isIP } from "node:net";

export function isE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

export function normalizeE164(phone: string): string | null {
  const normalized = phone.trim().replace(/[\s().-]/g, "");
  return isE164(normalized) ? normalized : null;
}

function parseClock(value: string, allowEndOfDay = false): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (allowEndOfDay && hours === 24 && minutes === 0) return 24 * 60;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isWithinIndiaCallWindow(
  now: Date,
  start = process.env.CALL_WINDOW_START ?? "09:00",
  end = process.env.CALL_WINDOW_END ?? "21:00",
): boolean {
  const startMinutes = parseClock(start);
  const endMinutes = parseClock(end, true);
  if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) return false;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const nowMinutes = hour * 60 + minute;
  return nowMinutes >= startMinutes && nowMinutes < endMinutes;
}

export function getPublicBaseUrl(): URL | null {
  const configured = process.env.PUBLIC_BASE_URL;
  if (!configured) return null;

  try {
    const url = new URL(configured);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      url.hostname === "localhost" ||
      url.hostname.endsWith(".localhost") ||
      isIP(url.hostname) !== 0
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function publicUrl(path: string): string {
  const base = getPublicBaseUrl();
  if (!base) throw new Error("PUBLIC_BASE_URL must be a public HTTPS URL");
  return new URL(path, `${base.origin}/`).toString();
}

export function publicUrlIfConfigured(path: string): string | undefined {
  const base = getPublicBaseUrl();
  return base ? new URL(path, `${base.origin}/`).toString() : undefined;
}
