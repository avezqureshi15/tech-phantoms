import { mix } from "@/lib/color";

describe("mix", () => {
  it("returns the base at 0 and the other colour at 1", () => {
    expect(mix("#ff0000", "#0000ff", 0)).toBe("#ff0000");
    expect(mix("#ff0000", "#0000ff", 1)).toBe("#0000ff");
  });

  it("blends channel by channel", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("accepts three-digit colours", () => {
    expect(mix("#fff", "#000", 0.5)).toBe("#808080");
  });
});
