// Time in this app has two sources of truth:
//  * "now" comes from the server (via X-Server-Time), so a wrong device clock can't skew countdowns;
//  * "today" is the calendar day in the *household's* time zone, so a family in Bengaluru and a
//    cousin in California agree on which festival day it is.

let skewMs = 0;

/** The current moment, corrected by the last time the server told us what time it was. */
export function now(): Date {
  return new Date(Date.now() + skewMs);
}

export function syncServerTime(header: string | null): void {
  if (!header) return;
  const serverMs = Date.parse(header);
  if (!Number.isNaN(serverMs)) skewMs = serverMs - Date.now();
}

export function resetClock(): void {
  skewMs = 0;
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** `timeZone` if this device knows it, otherwise the device's own zone. */
export function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return deviceTimeZone();
  }
}

/** The calendar date (YYYY-MM-DD) of an instant, as seen in `timeZone`. */
export function dateInZone(instant: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(typeof instant === "string" ? new Date(instant) : instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function todayIn(timeZone: string, at: Date = now()): string {
  return dateInZone(at, timeZone);
}

/** "Kolkata (GMT+5:30)" */
export function zoneLabel(timeZone: string, at: Date = now()): string {
  const zone = safeZone(timeZone);
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  const city = (zone.split("/").pop() ?? zone).replace(/_/g, " ");
  return offset ? `${city} (${offset})` : city;
}
