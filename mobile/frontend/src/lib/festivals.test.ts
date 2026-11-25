import { pickFeatured } from "@/lib/festivals";
import type { Festival } from "@/lib/schemas";

const make = (id: string, start: string, end: string, status: Festival["status"] = "planning"): Festival => ({
  id,
  household_id: "h",
  type: "DIWALI",
  name: id,
  start_date: start,
  end_date: end,
  status,
  readiness_score: 0,
  year: Number(start.slice(0, 4)),
});

const today = "2026-11-10";

describe("pickFeatured", () => {
  it("returns undefined when there are no festivals", () => {
    expect(pickFeatured([], today)).toBeUndefined();
  });

  it("prefers the soonest festival that has not ended", () => {
    const festivals = [
      make("past", "2026-01-01", "2026-01-03"),
      make("later", "2026-12-24", "2026-12-26"),
      make("sooner", "2026-11-12", "2026-11-14"),
    ];
    expect(pickFeatured(festivals, today)?.id).toBe("sooner");
  });

  it("counts a festival in progress as live", () => {
    const festivals = [make("now", "2026-11-09", "2026-11-11"), make("later", "2026-12-24", "2026-12-26")];
    expect(pickFeatured(festivals, today)?.id).toBe("now");
  });

  it("skips cancelled festivals", () => {
    const festivals = [make("cancelled", "2026-11-12", "2026-11-14", "cancelled"), make("kept", "2026-12-24", "2026-12-26")];
    expect(pickFeatured(festivals, today)?.id).toBe("kept");
  });

  it("falls back to the most recent past festival", () => {
    const festivals = [make("old", "2025-11-01", "2025-11-03"), make("recent", "2026-10-01", "2026-10-03")];
    expect(pickFeatured(festivals, today)?.id).toBe("recent");
  });
});
