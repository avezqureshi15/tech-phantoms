import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import type { IconName } from "@/lib/meta";
import { colors, radius, spacing } from "@/lib/theme";

type ChipProps = {
  label: string;
  icon?: IconName;
  selected?: boolean;
  onPress?: () => void;
  tone?: "neutral" | "success" | "warning";
};

const tones = {
  neutral: { bg: colors.sand, fg: colors.ink },
  success: { bg: colors.successBg, fg: colors.success },
  warning: { bg: "#FFF1D6", fg: "#9A5B00" },
};

export function Chip({ label, icon, selected = false, onPress, tone = "neutral" }: ChipProps) {
  const palette = tones[tone];
  const body = (
    <View
      style={[
        styles.chip,
        { backgroundColor: selected ? colors.maroon : palette.bg },
        selected && { borderColor: colors.maroon },
      ]}
    >
      {icon ? <Ionicons name={icon} size={15} color={selected ? colors.white : palette.fg} /> : null}
      <AppText variant="label" color={selected ? colors.white : palette.fg}>
        {label}
      </AppText>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
    >
      {body}
    </Pressable>
  );
}

type Option<T extends string> = { value: T; label: string; icon?: IconName };

type ChipSelectProps<T extends string> = {
  options: readonly Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
};

export function ChipSelect<T extends string>({ options, value, onChange }: ChipSelectProps<T>) {
  return (
    <View style={styles.wrap}>
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          icon={option.icon}
          selected={option.value === value}
          onPress={() => onChange(option.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "transparent",
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
