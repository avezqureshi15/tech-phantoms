import { Platform, type ViewStyle } from "react-native";

export const colors = {
  /** Near-black used for dark surfaces and strong text accents. */
  maroon: "#1F1A17",
  maroonDark: "#12100E",
  saffron: "#E8590C",
  saffronDeep: "#C2410C",
  saffronSoft: "#FDEBDD",
  marigold: "#F59F00",
  gold: "#B7791F",
  goldSoft: "#FBF0D5",
  /** The canvas every screen sits on. */
  cream: "#F6F5F2",
  parchment: "#F0EEE9",
  sand: "#ECEAE4",
  card: "#FFFFFF",
  ink: "#14110F",
  muted: "#6A645C",
  line: "#E6E3DC",
  success: "#2B7A4B",
  successBg: "#E5F3EB",
  danger: "#B42318",
  dangerBg: "#FDECEA",
  white: "#FFFFFF",
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

/** Font families loaded in the root layout (see app/_layout.tsx). */
export const fonts = {
  display: "DMSans_700Bold",
  displayMedium: "DMSans_600SemiBold",
  regular: "DMSans_400Regular",
  medium: "DMSans_500Medium",
  semibold: "DMSans_600SemiBold",
  bold: "DMSans_700Bold",
} as const;

export const shadow: ViewStyle = {};

export const shadowStrong: ViewStyle =
  Platform.select<ViewStyle>({
    ios: {
      shadowColor: "#3B0E19",
      shadowOpacity: 0.16,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
    },
    default: { elevation: 8 },
  }) ?? {};

/** Content never stretches wider than this, so tablets get a centred column, not a stretched phone. */
export const layout = { maxContentWidth: 640, tabletMin: 768, compactMax: 360 } as const;

/** Surfaces. Content cards are opaque (cheap to scroll, always legible); glass is for controls. */
export const surface = {
  card: "#FFFFFF",
  cardEdge: "#E6E3DC",
  tintSaffron: "rgba(232,89,12,0.10)",
  tintMaroon: "rgba(31,26,23,0.06)",
  tintGreen: "rgba(43,122,75,0.12)",
  tintGold: "rgba(183,121,31,0.14)",
} as const;

/** Cards are separated by a hairline, not a shadow: crisper, and far cheaper to scroll. */
export const softShadow: ViewStyle = {};

/** The smallest comfortable touch target (Apple and Google both ask for 44). */
export const MIN_TOUCH = 44;
