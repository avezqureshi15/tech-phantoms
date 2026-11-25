import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { PATTERNS, PatternArt, PatternSurface } from "@/components/Patterns";
import { Screen } from "@/components/Screen";
import { SectionTitle } from "@/components/Rows";
import { setPattern, usePattern, type PatternId } from "@/lib/appearance";
import { colors, MIN_TOUCH, radius, spacing } from "@/lib/theme";

const INK = colors.maroon;

function Tile({ id, label, hint, selected }: { id: PatternId; label: string; hint: string; selected: boolean }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}. ${hint}`}
      onPress={() => {
        void Haptics.selectionAsync();
        setPattern(id);
      }}
      style={[styles.tile, selected && styles.tileSelected]}
    >
      <View style={styles.swatch}>
        {id === "none" ? (
          <AppText variant="label" color="rgba(255,255,255,0.6)">
            No pattern
          </AppText>
        ) : (
          <PatternArt id={id} size={124} opacity={0.55} />
        )}
      </View>
      <View style={styles.caption}>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{label}</AppText>
          <AppText variant="caption" color={colors.muted} numberOfLines={2}>
            {hint}
          </AppText>
        </View>
        {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.saffronDeep} /> : null}
      </View>
    </Pressable>
  );
}

export default function AppearanceScreen() {
  const current = usePattern();
  return (
    <Screen>
      <PatternSurface color={INK} style={styles.preview}>
        <View style={styles.previewBody}>
          <AppText variant="eyebrow" color="rgba(255,255,255,0.7)">
            Preview
          </AppText>
          <AppText variant="title" color={colors.white}>
            Your festive pattern
          </AppText>
          <AppText color="rgba(255,255,255,0.7)">Shown on your festival, expense and Today cards.</AppText>
        </View>
      </PatternSurface>

      <SectionTitle title="Choose a pattern" />
      <View style={styles.grid} accessibilityRole="radiogroup">
        {PATTERNS.map((pattern) => (
          <Tile key={pattern.id} {...pattern} selected={pattern.id === current} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { minHeight: 150 },
  previewBody: { padding: spacing.xl, gap: spacing.xs },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    overflow: "hidden",
    minHeight: MIN_TOUCH,
  },
  tileSelected: { borderColor: colors.saffronDeep },
  swatch: { height: 112, backgroundColor: INK, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  caption: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md },
});
