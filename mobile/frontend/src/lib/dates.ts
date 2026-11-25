const DAY_MS = 86_400_000;

export function parseDate(value: string): Date {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

const pad = (n: number) => String(n).padStart(2, "0");

export function toApiDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toApiTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

/** Whole calendar days from one YYYY-MM-DD to another (UTC maths, so DST can't skew it). */
export function daysBetween(from: string, to: string): number {
  const utc = (value: string) => {
    const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

/** Days from `today` (a YYYY-MM-DD in the household's zone) until `value`; negative once past. */
export function daysUntil(value: string, today: string): number {
  return daysBetween(today, value);
}

const dayMonth = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const dayMonthYear = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDate(value: string): string {
  return dayMonthYear.format(parseDate(value));
}

export function formatRange(start: string, end: string): string {
  if (start === end) return formatDate(start);
  const from = parseDate(start);
  const to = parseDate(end);
  if (from.getFullYear() !== to.getFullYear()) return `${formatDate(start)} – ${formatDate(end)}`;
  return `${dayMonth.format(from)} – ${dayMonthYear.format(to)}`;
}

export function formatTime(value: string | null): string | null {
  if (!value) return null;
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${pad(minutes)} ${suffix}`;
}

export function countdownLabel(start: string, end: string, today: string): string {
  const untilStart = daysUntil(start, today);
  if (untilStart > 1) return `Starts in ${untilStart} days`;
  if (untilStart === 1) return "Starts tomorrow";
  return daysUntil(end, today) >= 0 ? "Happening now" : "Celebrated";
}

/** YYYY-MM-DD plus a number of days (UTC maths, so DST can't skew it). */
export function addDays(value: string, days: number): string {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

/**
 * The clock time in an ISO timestamp the API already expressed in the place's own timezone, as
 * "HH:mm", with "+1"/"-1" when it falls on another date than `day`. No timezone maths on the
 * device: the text is the local time at the place, whatever the phone's own zone is.
 */
export function placeClock(iso: string, day: string): string {
  const time = iso.slice(11, 16);
  const offset = daysBetween(day, iso.slice(0, 10));
  return offset === 0 ? time : `${time} ${offset > 0 ? "+" : ""}${offset}`;
}
