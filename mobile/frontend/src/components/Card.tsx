import { View, type StyleProp, type ViewStyle } from "react-native";

import { PressableScale } from "@/components/Motion";
import { radius, softShadow, spacing, surface } from "@/lib/theme";

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** A content surface: white, a hairline edge, no shadow. */
export function Card({ children, onPress, style, accessibilityLabel }: Props) {
  const base: StyleProp<ViewStyle> = [
    {
      backgroundColor: surface.card,
      borderRadius: radius.md,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: surface.cardEdge,
    },
    softShadow,
    style,
  ];

  if (!onPress) return <View style={base}>{children}</View>;

  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={base}>
      {children}
    </PressableScale>
  );
}
