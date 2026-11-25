import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { IconTile } from "@/components/IconTile";
import { PressableScale } from "@/components/Motion";
import { ProgressRing } from "@/components/ProgressRing";
import { useToday } from "@/lib/clock-context";
import { daysUntil, formatRange } from "@/lib/dates";
import { festivalMeta } from "@/lib/meta";
import type { Festival } from "@/lib/schemas";
import { PatternSurface } from "@/components/Patterns";
import { mix } from "@/lib/color";
import { colors, radius, spacing } from "@/lib/theme";

type Props = {
  festival: Festival;
  onPress?: () => void;
  /** Traditions honoured so far, shown as a ring. */
  progress?: { done: number; total: number };
};

function countdown(festival: Festival, today: string): { big: string; small: string } {
  const untilStart = daysUntil(festival.start_date, today);
  if (untilStart > 1) return { big: String(untilStart), small: "days to go" };
  if (untilStart === 1) return { big: "1", small: "day to go" };
  if (daysUntil(festival.end_date, today) >= 0) return { big: "Today", small: "is the celebration" };
  return { big: "Done", small: "a festival to remember" };
}

export function FestivalHero({ festival, onPress, progress }: Props) {
  const meta = festivalMeta(festival.type);
  const today = useToday();
  const { big, small } = countdown(festival, today);
  const isWord = big.length > 3;

  const body = (
    <PatternSurface color={mix(meta.gradient[0], colors.maroon, 0.55)} style={styles.card}>
      <View style={styles.top}>
        <IconTile icon={meta.icon} tint={meta.gradient[1]} size={44} />
        <AppText variant="eyebrow" color="rgba(255,255,255,0.7)">
          {meta.label}
        </AppText>
      </View>

      <View style={{ gap: 2 }}>
        <AppText variant="title" color={colors.white}>
          {festival.name}
        </AppText>
        <AppText color="rgba(255,255,255,0.7)">{formatRange(festival.start_date, festival.end_date)}</AppText>
      </View>

      <View style={styles.countdown}>
        <AppText variant="display" color={colors.white} style={[styles.bigNumber, isWord && styles.bigWord]}>
          {big}
        </AppText>
        <AppText variant="label" color="rgba(255,255,255,0.7)" style={styles.small}>
          {small}
        </AppText>
      </View>

      {progress && progress.total > 0 ? (
        <View style={styles.progress}>
          <ProgressRing value={progress.done} total={progress.total} size={48} />
          <View style={{ flex: 1 }}>
            <AppText variant="heading" color={colors.white}>
              {progress.done === progress.total ? "Every tradition honoured" : "Traditions honoured"}
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.7)">
              {progress.done === progress.total
                ? "Beautifully done"
                : `${progress.total - progress.done} still to go`}
            </AppText>
          </View>
        </View>
      ) : null}
    </PatternSurface>
  );

  if (!onPress) return body;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${festival.name}, ${big} ${small}`}
      onPress={onPress}
      scaleTo={0.985}
    >
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.xl, gap: spacing.lg },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  countdown: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  bigNumber: { fontSize: 56, lineHeight: 60, letterSpacing: -1.5 },
  bigWord: { fontSize: 36, lineHeight: 42 },
  small: { marginBottom: 8 },
  progress: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
