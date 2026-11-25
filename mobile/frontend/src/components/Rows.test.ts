import { pastLabel, scopeNote } from "@/components/Rows";
import type { Tradition } from "@/lib/schemas";

const tradition = (over: Partial<Tradition>) => ({ scope: "FAMILY", active: true, ...over }) as Tradition;

describe("festival rows", () => {
  it("says nothing in words while the days badge already says it", () => {
    expect(pastLabel("2026-12-26", "2026-11-25")).toBeNull(); // upcoming: the badge shows 29 days
    expect(pastLabel("2026-11-25", "2026-11-25")).toBeNull(); // last day: the badge says Now
  });

  it("marks a finished festival as celebrated", () => {
    expect(pastLabel("2026-11-12", "2026-11-25")).toBe("Celebrated");
  });
});

describe("tradition rows", () => {
  it("does not repeat 'Family tradition' on every row", () => {
    expect(scopeNote(tradition({}))).toBeNull();
  });

  it("says so when a tradition is paused or is not the family's own", () => {
    expect(scopeNote(tradition({ active: false }))).toBe("Paused");
    expect(scopeNote(tradition({ scope: "COMMUNITY" }))).toBe("Community tradition");
    expect(scopeNote(tradition({ scope: "COMMUNITY", active: false }))).toBe("Community tradition · Paused");
  });
});
