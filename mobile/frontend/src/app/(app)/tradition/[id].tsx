import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Card";
import { Chip } from "@/components/Chip";
import { PatternSurface } from "@/components/Patterns";
import { SectionTitle, scopeNote } from "@/components/Rows";
import { Screen } from "@/components/Screen";
import { ErrorState, ScreenSkeleton } from "@/components/States";
import { errorProps } from "@/lib/errors";
import { useTradition } from "@/features/queries";
import { dateInZone } from "@/lib/clock";
import { useTimeZone, useToday } from "@/lib/clock-context";
import { formatDate } from "@/lib/dates";
import { categoryMeta, festivalMeta } from "@/lib/meta";
import { colors, fonts, spacing } from "@/lib/theme";

function Detail({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <View style={{ gap: 4 }}>
      <AppText variant="label" color={colors.muted}>
        {title}
      </AppText>
      <AppText>{text}</AppText>
    </View>
  );
}

export default function TraditionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useTradition(id);
  const today = useToday();
  const timeZone = useTimeZone();

  if (!query.data) {
    return query.isError ? (
      <ErrorState {...errorProps(query.error)} onRetry={() => void query.refetch()} />
    ) : (
      <ScreenSkeleton topInset={false} />
    );
  }

  const tradition = query.data;
  const category = categoryMeta(tradition.category);
  const festival = festivalMeta(tradition.festival_type);
  const years = tradition.started_year ? Number(today.slice(0, 4)) - tradition.started_year : null;
  const hasDetails = [tradition.description, tradition.significance, tradition.origin, tradition.instructions].some(
    Boolean,
  );

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <PatternSurface color={festival.gradient[0]} size={260} style={styles.hero}>
        <Ionicons name={category.icon} size={40} color="#FFFFFF" />
        <AppText variant="title" color="#FFFFFF">
          {tradition.name}
        </AppText>
        {years !== null && years > 0 ? (
          <AppText color="rgba(255,255,255,0.9)">
            Passed down for {years} {years === 1 ? "year" : "years"}
          </AppText>
        ) : null}
      </PatternSurface>

      <View style={styles.chips}>
        <Chip label={festival.label} icon={festival.icon} />
        <Chip label={category.label} />
        {scopeNote(tradition) ? <Chip label={scopeNote(tradition)!} /> : null}
        {tradition.region ? <Chip label={tradition.region} /> : null}
      </View>

      {hasDetails ? (
        <Card style={{ gap: spacing.lg }}>
          <Detail title="About" text={tradition.description} />
          <Detail title="Why it matters" text={tradition.significance} />
          <Detail title="Where it comes from" text={tradition.origin} />
          <Detail title="How it's done" text={tradition.instructions} />
        </Card>
      ) : null}

      <View style={{ gap: spacing.md }}>
        <SectionTitle title="Through the years" />
        {tradition.occurrences.length === 0 ? (
          <Card>
            <AppText color={colors.muted}>
              {"Nothing recorded yet. Mark this tradition as done from a festival's checklist and it will appear here."}
            </AppText>
          </Card>
        ) : (
          tradition.occurrences.map((occurrence) => (
            <Card key={occurrence.id}>
              <View style={styles.history}>
                <AppText style={styles.year}>{occurrence.year}</AppText>
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText variant="heading">{occurrence.festival_name}</AppText>
                  {occurrence.performer ? (
                    <View style={styles.performer}>
                      <Avatar name={occurrence.performer.name} uri={occurrence.performer.avatar_url} size={24} />
                      <AppText variant="caption" color={colors.muted}>
                        {occurrence.performer.name}
                      </AppText>
                    </View>
                  ) : null}
                  {occurrence.notes ? <AppText variant="caption">{occurrence.notes}</AppText> : null}
                  {occurrence.completed_at ? (
                    <AppText variant="caption" color={colors.muted}>
                      Done on {formatDate(dateInZone(occurrence.completed_at, timeZone))}
                    </AppText>
                  ) : null}
                </View>
              </View>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { padding: spacing.xl, gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  history: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  // An explicit line height: the display face is taller than its default line box, and without room
  // the tops of the digits are cut off by the card.
  year: { fontFamily: fonts.display, fontSize: 28, lineHeight: 36, color: colors.saffronDeep, minWidth: 68 },
  performer: { flexDirection: "row", alignItems: "center", gap: 6 },
});
