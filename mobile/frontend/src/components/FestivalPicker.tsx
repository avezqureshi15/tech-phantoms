import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { AppText } from "@/components/AppText";
import { IconTile } from "@/components/IconTile";
import { useCurrentUser } from "@/lib/auth";
import { FAITHS, FESTIVAL_FAITH, FESTIVAL_TYPES, faithLabel } from "@/lib/meta";
import { colors, fonts, MIN_TOUCH, radius, spacing } from "@/lib/theme";

type Props = { value: string | null; onChange: (type: string) => void };

/** Sections in the order a person wants them: their own faiths, everyday celebrations, then the rest. */
function sectionOrder(mine: string[]): string[] {
  const all = FAITHS.map((f) => f.value);
  const rest = all.filter((f) => !mine.includes(f));
  return [...mine, "general", ...rest];
}

/** Pick a festival from a searchable, grouped grid instead of a wall of chips. */
export function FestivalPicker({ value, onChange }: Props) {
  const user = useCurrentUser();
  const [query, setQuery] = useState("");

  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sectionOrder(user.faiths)
      .map((faith) => ({
        faith,
        items: Object.entries(FESTIVAL_TYPES).filter(
          ([code, meta]) => FESTIVAL_FAITH[code] === faith && (!needle || meta.label.toLowerCase().includes(needle)),
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [query, user.faiths]);

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          accessibilityLabel="Search festivals"
          value={query}
          onChangeText={setQuery}
          placeholder="Search festivals"
          placeholderTextColor="#B5A79C"
          autoCorrect={false}
          style={styles.input}
        />
      </View>

      {sections.length === 0 ? (
        <AppText color={colors.muted}>No festival matches &quot;{query}&quot;. Try &quot;Our own festival&quot;.</AppText>
      ) : null}

      {sections.map((section) => (
        <View key={section.faith} style={{ gap: spacing.sm }}>
          <AppText variant="eyebrow" color={colors.muted}>
            {section.faith === "general"
              ? "Everyday celebrations"
              : user.faiths.includes(section.faith)
                ? `${faithLabel(section.faith)} (yours)`
                : faithLabel(section.faith)}
          </AppText>
          <View style={styles.grid}>
            {section.items.map(([code, meta]) => {
              const selected = code === value;
              return (
                <Pressable
                  key={code}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={meta.label}
                  onPress={() => onChange(code)}
                  style={[styles.tile, selected && styles.tileSelected]}
                >
                  <IconTile icon={meta.icon} gradient={meta.gradient} size={36} />
                  <AppText variant="label" numberOfLines={2} style={styles.tileLabel}>
                    {meta.label}
                  </AppText>
                  {selected ? <Ionicons name="checkmark-circle" size={20} color={colors.saffronDeep} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: "#FFFDF9", borderRadius: radius.md, paddingHorizontal: 14, minHeight: MIN_TOUCH + 4, borderWidth: 1, borderColor: colors.line },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, paddingVertical: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: { flexBasis: "48.5%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: 10, minHeight: 56, borderRadius: radius.md, backgroundColor: "#FFFDF9", borderWidth: 1.5, borderColor: "rgba(94,22,38,0.08)" },
  tileSelected: { borderColor: colors.saffronDeep, backgroundColor: "#FFF4EA" },
  tileLabel: { flex: 1 },
});
