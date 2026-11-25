import {
  spanParts,
  addDays,
  countdownLabel,
  daysBetween,
  daysUntil,
  formatRange,
  placeClock,
  formatTime,
  parseDate,
  toApiDate,
  toApiTime,
} from "@/lib/dates";

describe("dates", () => {
  it("parses API dates as local calendar days, not UTC", () => {
    const date = parseDate("2026-11-08");
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 10, 8]);
  });

  it("round-trips a date and formats times without UTC drift", () => {
    expect(toApiDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(toApiTime(new Date(2026, 0, 5, 7, 5))).toBe("07:05:00");
  });

  it("counts whole calendar days between two dates", () => {
    expect(daysUntil("2026-11-08", "2026-11-07")).toBe(1);
    expect(daysUntil("2026-11-07", "2026-11-07")).toBe(0);
    expect(daysUntil("2026-11-06", "2026-11-07")).toBe(-1);
  });

  it("counts across month, year and leap-day boundaries", () => {
    expect(daysBetween("2026-12-31", "2027-01-02")).toBe(2);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2); // 2028 is a leap year
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });

  it("is immune to daylight-saving changes in the device zone", () => {
    // Spring-forward and fall-back days are 23 and 25 hours long on the clock.
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
  });

  it("formats ranges within and across years", () => {
    expect(formatRange("2026-11-08", "2026-11-12")).toBe("8 Nov – 12 Nov 2026");
    expect(formatRange("2026-12-30", "2027-01-02")).toBe("30 Dec 2026 – 2 Jan 2027");
    expect(formatRange("2026-11-08", "2026-11-08")).toBe("8 Nov 2026");
  });

  it("formats 12-hour times including midnight and noon", () => {
    expect(formatTime("00:05:00")).toBe("12:05 AM");
    expect(formatTime("12:00:00")).toBe("12:00 PM");
    expect(formatTime("19:30:00")).toBe("7:30 PM");
    expect(formatTime(null)).toBeNull();
  });

  it("labels the countdown", () => {
    const today = "2026-11-07";
    expect(countdownLabel("2026-11-10", "2026-11-12", today)).toBe("Starts in 3 days");
    expect(countdownLabel("2026-11-08", "2026-11-12", today)).toBe("Starts tomorrow");
    expect(countdownLabel("2026-11-07", "2026-11-09", today)).toBe("Happening now");
    expect(countdownLabel("2026-11-01", "2026-11-06", today)).toBe("Celebrated");
  });
});

describe("addDays and placeClock", () => {
  it("moves across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("shows the place's own clock text and flags other dates", () => {
    expect(placeClock("2026-11-08T11:28:14+05:30", "2026-11-08")).toBe("11:28");
    expect(placeClock("2026-11-09T12:31:58+05:30", "2026-11-08")).toBe("12:31 +1");
    expect(placeClock("2026-11-07T22:00:00+05:30", "2026-11-08")).toBe("22:00 -1");
  });
});

describe("the limbs of the day", () => {
  const spans = [
    { name: "Pratipada", paksha: "Krishna", end: "2026-11-25T11:20:00Z" },
    { name: "Dwitiya", paksha: "Krishna", end: "2026-11-26T07:45:00Z" },
  ];

  it("splits each limb into a name and the time it lasts until", () => {
    const parts = spanParts(spans, "2026-11-25", true);
    expect(parts[0]!.name).toBe("Pratipada (Krishna)");
    expect(parts[0]!.nextDay).toBe(false);
  });

  it("shows a limb that ends tomorrow as 'next day', not a stray +1", () => {
    const parts = spanParts(spans, "2026-11-25");
    expect(parts[1]!.nextDay).toBe(true);
    expect(parts[1]!.until).not.toContain("+1");
  });
});
