import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { GROUP_COLORS, GROUP_EMOJIS, GROUP_SYMBOLS } from "@/lib/meta";
import { colors, radius, spacing } from "@/lib/theme";

type Props = {
  icon: string | null;
  color: string | null;
  onChange: (next: { icon: string | null; color: string | null }) => void;
};

const CELL = 44;

/** Choose a group's icon (an emoji or a clean symbol) and its colour. */
export function IconPicker({ icon, color, onChange }: Props) {
  const tint = color ?? colors.maroon;
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" color={colors.muted}>
          Colour
        </AppText>
        <View style={styles.grid}>
          {GROUP_COLORS.map((swatch) => (
            <Pressable
              key={swatch}
              accessibilityRole="button"
              accessibilityLabel={`Colour ${swatch}`}
              accessibilityState={{ selected: swatch === color }}
              onPress={() => onChange({ icon, color: swatch })}
              style={[styles.swatch, { backgroundColor: swatch }, swatch === color && styles.selectedRing]}
            >
              {swatch === color ? <Ionicons name="checkmark" size={18} color={colors.white} /> : null}
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" color={colors.muted}>
          Symbol
        </AppText>
        <View style={styles.grid}>
          {GROUP_SYMBOLS.map((name) => {
            const value = `symbol:${name}`;
            const selected = icon === value;
            return (
              <Pressable
                key={name}
                accessibilityRole="button"
                accessibilityLabel={`Symbol ${name}`}
                accessibilityState={{ selected }}
                onPress={() => onChange({ icon: value, color })}
                style={[styles.cell, selected && { backgroundColor: tint }]}
              >
                <Ionicons name={name} size={22} color={selected ? colors.white : colors.maroon} />
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" color={colors.muted}>
          Or an emoji
        </AppText>
        <View style={styles.grid}>
          {GROUP_EMOJIS.map((emoji) => {
            const value = `emoji:${emoji}`;
            const selected = icon === value;
            return (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={`Emoji ${emoji}`}
                accessibilityState={{ selected }}
                onPress={() => onChange({ icon: value, color })}
                style={[styles.cell, selected && { backgroundColor: tint }]}
              >
                <AppText style={{ fontSize: 22, lineHeight: 28 }}>{emoji}</AppText>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sand,
  },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  selectedRing: { borderWidth: 3, borderColor: colors.white, boxShadow: "0 0 0 2px #2A1A17" },
});
