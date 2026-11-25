import * as Calendar from "expo-calendar";
import { Platform } from "react-native";

import { addToPhoneCalendar, allDayRange } from "@/lib/calendar";

jest.mock("expo-calendar", () => ({
  requestCalendarPermissions: jest.fn(),
  getDefaultCalendarSync: jest.fn(),
  getCalendars: jest.fn(),
  EntityTypes: { EVENT: "event" },
}));

const calendars = jest.mocked(Calendar);
const createEvent = jest.fn();
const EVENT = { title: "Christmas 2026", startDate: "2026-12-24", endDate: "2026-12-26", notes: "Family dinner" };

beforeEach(() => {
  jest.clearAllMocks();
  calendars.requestCalendarPermissions.mockResolvedValue({ granted: true } as never);
});

describe("allDayRange", () => {
  it("runs from midnight of the first day to midnight after the last", () => {
    const { start, end } = allDayRange("2026-12-24", "2026-12-26");

    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()]).toEqual([2026, 11, 24, 0]);
    expect([end.getFullYear(), end.getMonth(), end.getDate(), end.getHours()]).toEqual([2026, 11, 27, 0]);
  });

  it("handles a one-day event and a month boundary", () => {
    const { start, end } = allDayRange("2026-12-31", "2026-12-31");

    expect(end.getTime() - start.getTime()).toBe(24 * 3600 * 1000);
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2027, 0, 1]);
  });
});

describe("addToPhoneCalendar", () => {
  it("asks only to add events, and creates nothing when refused", async () => {
    calendars.requestCalendarPermissions.mockResolvedValue({ granted: false } as never);

    expect(await addToPhoneCalendar(EVENT)).toBe("denied");
    expect(calendars.requestCalendarPermissions).toHaveBeenCalledWith(true); // write-only
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("adds an all-day event with a reminder a day before to the iPhone's default calendar", async () => {
    Platform.OS = "ios";
    calendars.getDefaultCalendarSync.mockReturnValue({ createEvent } as never);

    expect(await addToPhoneCalendar(EVENT)).toBe("added");

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Christmas 2026", allDay: true, notes: "Family dinner", alarms: [{ relativeOffset: -1440 }] }),
    );
  });

  it("on Android picks the primary calendar that can be written to", async () => {
    Platform.OS = "android";
    const wanted = jest.fn();
    calendars.getCalendars.mockResolvedValue([
      { allowsModifications: false, isPrimary: true, createEvent: jest.fn() },
      { allowsModifications: true, isPrimary: false, createEvent: jest.fn() },
      { allowsModifications: true, isPrimary: true, createEvent: wanted },
    ] as never);

    expect(await addToPhoneCalendar(EVENT)).toBe("added");
    expect(wanted).toHaveBeenCalled();
  });

  it("says so when there is no calendar to add to", async () => {
    Platform.OS = "android";
    calendars.getCalendars.mockResolvedValue([{ allowsModifications: false, isPrimary: true }] as never);

    expect(await addToPhoneCalendar(EVENT)).toBe("no-calendar");
  });
});
