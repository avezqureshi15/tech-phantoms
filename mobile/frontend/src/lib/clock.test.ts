import { dateInZone, deviceTimeZone, now, resetClock, syncServerTime, todayIn, zoneLabel } from "@/lib/clock";

describe("clock", () => {
  beforeEach(() => {
    resetClock();
    jest.useFakeTimers().setSystemTime(new Date("2026-11-24T20:00:00Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("computes the calendar date in a given time zone", () => {
    const instant = new Date("2026-11-24T20:00:00Z");
    expect(dateInZone(instant, "Asia/Kolkata")).toBe("2026-11-25"); // 01:30 the next day
    expect(dateInZone(instant, "America/Los_Angeles")).toBe("2026-11-24"); // 12:00 same day
    expect(dateInZone(instant, "UTC")).toBe("2026-11-24");
  });

  it("accepts ISO timestamps from the API", () => {
    expect(dateInZone("2026-11-08T19:00:00+00:00", "Asia/Kolkata")).toBe("2026-11-09");
  });

  it("lets a family and a faraway cousin disagree about 'today' only when they should", () => {
    expect(todayIn("Asia/Kolkata")).toBe("2026-11-25");
    expect(todayIn("America/Los_Angeles")).toBe("2026-11-24");
  });

  it("falls back to the device zone when the household zone is unknown to this device", () => {
    expect(todayIn("Not/AZone")).toBe(todayIn(deviceTimeZone()));
  });

  it("trusts the server's clock over a wrong device clock", () => {
    // The device thinks it is 20:00 UTC on the 24th; the server says it is the 27th.
    syncServerTime("2026-11-27T20:00:00.000Z");

    expect(now().toISOString()).toBe("2026-11-27T20:00:00.000Z");
    expect(todayIn("UTC")).toBe("2026-11-27");
  });

  it("keeps ticking relative to the device after syncing", () => {
    syncServerTime("2026-11-27T20:00:00.000Z");
    jest.setSystemTime(new Date("2026-11-24T20:00:05Z")); // five real seconds later

    expect(now().toISOString()).toBe("2026-11-27T20:00:05.000Z");
  });

  it("ignores missing or garbage server time headers", () => {
    syncServerTime(null);
    syncServerTime("not a date");

    expect(now().toISOString()).toBe("2026-11-24T20:00:00.000Z");
  });

  it("labels a zone with its city and current UTC offset", () => {
    expect(zoneLabel("Asia/Kolkata")).toBe("Kolkata (GMT+5:30)");
    expect(zoneLabel("America/Los_Angeles")).toBe("Los Angeles (GMT-8)");
  });
});
