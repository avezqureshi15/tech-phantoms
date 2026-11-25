import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Chip } from "@/components/Chip";
import { useToday } from "@/lib/clock-context";
import { daysUntil, formatRange } from "@/lib/dates";
import { IconTile } from "@/components/IconTile";
import { categoryMeta, festivalMeta, titleCase } from "@/lib/meta";
import type { Festival, Tradition } from "@/lib/schemas";
import { colors, radius, spacing } from "@/lib/theme";

export function SectionTitle({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionRow}>
      <AppText variant="heading">{title}</AppText>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <AppText variant="label" color={colors.saffronDeep}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function PageHeader({
  title,
  subtitle,
  onAdd,
  addLabel,
  right,
}: {
  title: string;
  subtitle?: string;
  onAdd?: () => void;
  addLabel?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="display" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText color={colors.muted} numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
      {onAdd ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={addLabel ?? "Add"}
          onPress={onAdd}
          style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="add" size={26} color={colors.white} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Only a festival that is over needs a words label: for the others the badge on the right already
 * says how many days are left, and saying it twice is noise. */
export function pastLabel(end: string, today: string): string | null {
  return daysUntil(end, today) < 0 ? "Celebrated" : null;
}

export function FestivalRow({ festival, onPress }: { festival: Festival; onPress: () => void }) {
  const meta = festivalMeta(festival.type);
  const today = useToday();
  return (
    <Card onPress={onPress} accessibilityLabel={festival.name}>
      <View style={styles.row}>
        <IconTile icon={meta.icon} gradient={meta.gradient} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading" numberOfLines={1}>
            {festival.name}
          </AppText>
          <AppText variant="caption" color={colors.muted}>
            {formatRange(festival.start_date, festival.end_date)}
          </AppText>
          {pastLabel(festival.end_date, today) ? (
            <AppText variant="caption" color={colors.muted}>
              {pastLabel(festival.end_date, today)}
            </AppText>
          ) : null}
        </View>
        {festival.status === "cancelled" ? (
          <Chip label="Cancelled" tone="warning" />
        ) : (
          <DaysBadge festival={festival} />
        )}
      </View>
    </Card>
  );
}

function DaysBadge({ festival }: { festival: Festival }) {
  const today = useToday();
  const days = daysUntil(festival.start_date, today);
  if (daysUntil(festival.end_date, today) < 0)
    return <Ionicons name="checkmark-circle" size={22} color={colors.success} />;
  if (days <= 0) return <Chip label="Now" tone="success" />;
  return (
    <View style={{ alignItems: "center", minWidth: 40 }}>
      <AppText variant="title" color={colors.saffronDeep} style={{ fontSize: 24, lineHeight: 28 }}>
        {days}
      </AppText>
      <AppText variant="eyebrow" color={colors.muted} style={{ fontSize: 9 }}>
        {days === 1 ? "day" : "days"}
      </AppText>
    </View>
  );
}

/** What is worth saying about a tradition beyond its row: that it is paused, or that it is not the
 * family's own. Every tradition being "Family tradition" tells nobody anything. */
export function scopeNote(tradition: Tradition): string | null {
  const notes = [
    tradition.scope === "FAMILY" ? null : `${titleCase(tradition.scope)} tradition`,
    tradition.active ? null : "Paused",
  ].filter(Boolean);
  return notes.length ? notes.join(" · ") : null;
}

export function TraditionRow({ tradition, onPress }: { tradition: Tradition; onPress: () => void }) {
  const category = categoryMeta(tradition.category);
  return (
    <Card onPress={onPress} accessibilityLabel={tradition.name}>
      <View style={styles.row}>
        <IconTile icon={category.icon} gradient={festivalMeta(tradition.festival_type).gradient} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading" numberOfLines={1}>
            {tradition.name}
          </AppText>
          <AppText variant="caption" color={colors.muted}>
            {festivalMeta(tradition.festival_type).label} · {category.label}
            {tradition.started_year ? ` · since ${tradition.started_year}` : ""}
          </AppText>
          {scopeNote(tradition) ? (
            <AppText variant="caption" color={colors.saffronDeep}>
              {scopeNote(tradition)}
            </AppText>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pageHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  addButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.saffron,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  tile: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
