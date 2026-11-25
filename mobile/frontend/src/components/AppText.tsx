import { Text, type TextProps, type TextStyle } from "react-native";

import { colors, fonts } from "@/lib/theme";

type Variant = "display" | "title" | "heading" | "body" | "label" | "caption" | "eyebrow";

const variants: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, letterSpacing: -0.7 },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.1 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23 },
  label: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  eyebrow: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
};

type Props = TextProps & { variant?: Variant; color?: string };

export function AppText({ variant = "body", color = colors.ink, style, ...props }: Props) {
  // Scales with the system text size, but only so far that layouts still hold together.
  return <Text maxFontSizeMultiplier={1.35} {...props} style={[variants[variant], { color }, style]} />;
}
