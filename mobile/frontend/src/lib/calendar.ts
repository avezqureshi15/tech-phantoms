import * as Calendar from "expo-calendar";
import { Platform } from "react-native";

export type CalendarEventInput = {
  title: string;
  /** First day, as YYYY-MM-DD. */
  startDate: string;
  /** Last day, as YYYY-MM-DD (the same as the first for a one-day event). */
  endDate: string;
  notes?: string | null;
};

export type AddResult = "added" | "denied" | "no-calendar";

/** A festival is an all-day event: starts at midnight of the first day, ends at midnight after the last. */
export function allDayRange(startDate: string, endDate: string): { start: Date; end: Date } {
  const [sy, sm, sd] = startDate.split("-").map(Number) as [number, number, number];
  const [ey, em, ed] = endDate.split("-").map(Number) as [number, number, number];
  return { start: new Date(sy, sm - 1, sd), end: new Date(ey, em - 1, ed + 1) };
}

/**
 * Adds the event to the phone's own calendar: Apple Calendar on iPhone (including iCloud and any Google
 * account added to it), and the person's Google or other writable calendar on Android. On iOS 17+ it
 * asks only for permission to add events, never to read them.
 */
export async function addToPhoneCalendar(event: CalendarEventInput): Promise<AddResult> {
  const permission = await Calendar.requestCalendarPermissions(true);
  if (!permission.granted) return "denied";

  const calendar =
    Platform.OS === "ios"
      ? Calendar.getDefaultCalendarSync()
      : (await Calendar.getCalendars(Calendar.EntityTypes.EVENT))
          .filter((c) => c.allowsModifications)
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0];
  if (!calendar) return "no-calendar";

  const { start, end } = allDayRange(event.startDate, event.endDate);
  await calendar.createEvent({
    title: event.title,
    startDate: start,
    endDate: end,
    allDay: true,
    notes: event.notes ?? undefined,
    alarms: [{ relativeOffset: -24 * 60 }], // a day before
  });
  return "added";
}
