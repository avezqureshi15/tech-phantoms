import { useWindowDimensions } from "react-native";

import { layout } from "@/lib/theme";

export type SizeClass = "compact" | "regular" | "tablet";

/** The layout facts for a window of this size. Pure, so it is easy to test. */
export function layoutFor(width: number, height: number) {
  const sizeClass: SizeClass =
    width >= layout.tabletMin ? "tablet" : width <= layout.compactMax ? "compact" : "regular";
  return {
    width,
    height,
    sizeClass,
    isTablet: sizeClass === "tablet",
    isCompact: sizeClass === "compact",
    contentWidth: Math.min(width, layout.maxContentWidth),
  };
}

/**
 * How much room the screen has. Phones get the full width; on a tablet the app centres a column of
 * `maxContentWidth` instead of stretching a phone layout across the screen.
 */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  return layoutFor(width, height);
}
