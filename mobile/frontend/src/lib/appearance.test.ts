import { isPatternId, PATTERN_IDS } from "@/lib/appearance";

describe("isPatternId", () => {
  it("accepts every pattern we offer", () => {
    for (const id of PATTERN_IDS) expect(isPatternId(id)).toBe(true);
  });

  it("rejects anything else, so a stale or tampered stored value falls back to the default", () => {
    expect(isPatternId("gradient")).toBe(false);
    expect(isPatternId("")).toBe(false);
    expect(isPatternId(null)).toBe(false);
    expect(isPatternId(undefined)).toBe(false);
    expect(isPatternId(3)).toBe(false);
  });
});
