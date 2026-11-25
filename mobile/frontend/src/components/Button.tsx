import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { AppText } from "@/components/AppText";
import { PressableScale } from "@/components/Motion";
import type { IconName } from "@/lib/meta";
import { colors, radius } from "@/lib/theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

const textColor: Record<Variant, string> = {
  primary: colors.white,
  secondary: colors.ink,
  ghost: colors.saffronDeep,
  danger: colors.danger,
};

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  loading = false,
  disabled = false,
  style,
}: Props) {
  const inactive = disabled || loading;
  const color = textColor[variant];

  const content = (
    <View style={styles.row}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={19} color={color} /> : null}
          <AppText variant="heading" color={color}>
            {label}
          </AppText>
        </>
      )}
    </View>
  );

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      scaleTo={0.97}
      fill={false}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={[
        styles.shell,
        variant === "primary" && styles.primaryShell,
        variant === "secondary" && styles.secondary,
        variant === "danger" && styles.danger,
        inactive && { opacity: 0.5 },
        style,
      ]}
    >
      <View style={styles.clip}>
        <View style={styles.fill}>{content}</View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  shell: { borderRadius: radius.md, minHeight: 52 },
  // No \`flex: 1\` here on purpose: inside a scrolling page it would stretch to fill the whole viewport.
  clip: { borderRadius: radius.md, overflow: "hidden" },
  fill: { minHeight: 52, justifyContent: "center", paddingHorizontal: 20 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryShell: { backgroundColor: colors.saffronDeep },
  secondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  danger: { backgroundColor: colors.dangerBg },
});
