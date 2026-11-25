import { layoutFor } from "@/lib/layout";
import { layout } from "@/lib/theme";

describe("layoutFor", () => {
  it("treats a small phone as compact", () => {
    expect(layoutFor(320, 568)).toMatchObject({ sizeClass: "compact", isCompact: true, isTablet: false, contentWidth: 320 });
  });

  it("treats a normal phone as regular and uses its full width", () => {
    expect(layoutFor(393, 852)).toMatchObject({ sizeClass: "regular", isTablet: false, contentWidth: 393 });
  });

  it("treats a tablet as tablet and caps the content column", () => {
    const result = layoutFor(834, 1194);
    expect(result.sizeClass).toBe("tablet");
    expect(result.contentWidth).toBe(layout.maxContentWidth);
  });

  it("switches to the tablet layout exactly at the breakpoint", () => {
    expect(layoutFor(layout.tabletMin - 1, 1000).isTablet).toBe(false);
    expect(layoutFor(layout.tabletMin, 1000).isTablet).toBe(true);
  });

  it("is compact at its own boundary and regular just above it", () => {
    expect(layoutFor(layout.compactMax, 700).sizeClass).toBe("compact");
    expect(layoutFor(layout.compactMax + 1, 700).sizeClass).toBe("regular");
  });
});
