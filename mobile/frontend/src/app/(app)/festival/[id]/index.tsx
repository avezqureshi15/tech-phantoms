import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { TrackRow } from "@/components/TrackRow";
import { useAudio ,
  useChecklist,
  useCompleteTradition,
  useFestival,
  useIsAdmin,
  useUpdateFestivalStatus,
} from "@/features/queries";
import { Card } from "@/components/Card";
import { ChipSelect } from "@/components/Chip";
import { FestivalHero } from "@/components/FestivalHero";
import { SectionTitle } from "@/components/Rows";
import { Screen } from "@/components/Screen";
import { ErrorState, Loading, ScreenSkeleton } from "@/components/States";
import { errorProps } from "@/lib/errors";
import { useCurrentUser } from "@/lib/auth";
import { deviceTimeZone, zoneLabel } from "@/lib/clock";
import { useTimeZone } from "@/lib/clock-context";
import { formatDate, formatTime, parseDate } from "@/lib/dates";
import { titleCase } from "@/lib/meta";
import type { ChecklistItem, FestivalStatus } from "@/lib/schemas";
import { colors, spacing } from "@/lib/theme";

const STATUSES = (["planning", "active", "completed", "cancelled"] as const).map((value) => ({
  value,
  label: titleCase(value),
}));

export default function FestivalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useCurrentUser();
  const timeZone = useTimeZone();
  const festival = useFestival(id);
  const checklist = useChecklist(id);
  const isAdmin = useIsAdmin(festival.data?.household_id);
  const updateStatus = useUpdateFestivalStatus({
    id,
    household_id: festival.data?.household_id ?? "",
  });
  const complete = useCompleteTradition();

  if (!festival.data) {
    return festival.isError ? (
      <ErrorState {...errorProps(festival.error)} onRetry={() => void festival.refetch()} />
    ) : (
      <ScreenSkeleton topInset={false} />
    );
  }

  const items = checklist.data ?? [];
  const done = items.filter((i) => i.completed).length;

  const confirmComplete = (item: ChecklistItem) => {
    Alert.alert(`Mark "${item.tradition.name}" as done?`, "It will be added to your family history.", [
      { text: "Not yet", style: "cancel" },
      {
        text: "Yes, done",
        onPress: () =>
          complete.mutate(
            { traditionId: item.tradition.id, festivalId: id, performedBy: user.id },
            { onError: (error) => Alert.alert("Couldn't save", error.message) },
          ),
      },
    ]);
  };

  return (
    <Screen
      refreshing={festival.isRefetching || checklist.isRefetching}
      onRefresh={() => {
        void festival.refetch();
        void checklist.refetch();
      }}
    >
      <FestivalHero festival={festival.data} progress={{ done, total: items.length }} />

      {isAdmin ? (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="label" color={colors.muted}>
            Status
          </AppText>
          <ChipSelect<FestivalStatus>
            options={STATUSES}
            value={festival.data.status}
            onChange={(status) =>
              updateStatus.mutate(status, {
                onError: (error) => Alert.alert("Couldn't update", error.message),
              })
            }
          />
        </View>
      ) : null}

      <View style={{ gap: spacing.md }}>
        <SectionTitle
          title="Schedule"
          actionLabel={isAdmin ? "Add event" : undefined}
          onAction={() => router.push(`/festival/${id}/add-event`)}
        />
        {festival.data.events.length > 0 && timeZone !== deviceTimeZone() ? (
          <AppText variant="caption" color={colors.muted}>
            {`Times are in the household's time zone: ${zoneLabel(timeZone)}.`}
          </AppText>
        ) : null}
        {festival.data.events.length === 0 ? (
          <Card>
            <AppText color={colors.muted}>
              {isAdmin
                ? "No events yet. Add the puja, the feast, the family gathering."
                : "No events have been added yet."}
            </AppText>
          </Card>
        ) : (
          festival.data.events.map((event) => (
            <Card key={event.id}>
              <View style={styles.row}>
                <View style={styles.dateBadge}>
                  <AppText variant="caption" color={colors.saffronDeep}>
                    {parseDate(event.event_date).toLocaleDateString("en-IN", { month: "short" }).toUpperCase()}
                  </AppText>
                  <AppText variant="heading">{parseDate(event.event_date).getDate()}</AppText>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="heading">{event.name}</AppText>
                  <AppText variant="caption" color={colors.muted}>
                    {[
                      [formatTime(event.start_time), formatTime(event.end_time)].filter(Boolean).join(" – "),
                      event.location,
                    ]
                      .filter(Boolean)
                      .join(" · ") || formatDate(event.event_date)}
                  </AppText>
                  {event.description ? <AppText variant="caption">{event.description}</AppText> : null}
                </View>
              </View>
            </Card>
          ))
        )}
      </View>

      <View style={{ gap: spacing.md }}>
        <SectionTitle
          title="Traditions"
          actionLabel="Add"
          onAction={() => router.push("/tradition/new")}
        />
        {checklist.isPending ? (
          <Loading />
        ) : items.length === 0 ? (
          <Card>
            <AppText color={colors.muted}>
              No traditions recorded for this festival yet. Add the ones your family keeps.
            </AppText>
          </Card>
        ) : (
          items.map((item) => (
            <Card key={item.tradition.id}>
              <View style={styles.row}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.completed }}
                  accessibilityLabel={`Mark ${item.tradition.name} as done`}
                  disabled={item.completed || complete.isPending}
                  hitSlop={8}
                  onPress={() => confirmComplete(item)}
                >
                  <Ionicons
                    name={item.completed ? "checkmark-circle" : "ellipse-outline"}
                    size={30}
                    color={item.completed ? colors.success : colors.line}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={{ flex: 1, gap: 2 }}
                  onPress={() => router.push(`/tradition/${item.tradition.id}`)}
                >
                  <AppText variant="heading">{item.tradition.name}</AppText>
                  <AppText variant="caption" color={item.completed ? colors.success : colors.muted}>
                    {item.completed
                      ? `Done${item.performed_by ? ` by ${item.performed_by.name}` : ""}`
                      : "Not done yet"}
                  </AppText>
                </Pressable>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </View>
            </Card>
          ))
        )}
      </View>

      <FestivalMusic type={festival.data.type} />

      <Button
        label="Festival expenses"
        icon="wallet"
        variant="secondary"
        onPress={() => router.push(`/expenses?festival=${id}` as never)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dateBadge: {
    width: 52,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: colors.sand,
  },
});

/** A few pieces of music for this festival, with a way to see them all. */
function FestivalMusic({ type }: { type: string }) {
  const audio = useAudio(type);
  const tracks = audio.data?.tracks ?? [];
  if (tracks.length === 0) return null;
  return (
    <View style={{ gap: spacing.md }}>
      <SectionTitle
        title="Music for this festival"
        actionLabel={tracks.length > 3 ? "See all" : undefined}
        onAction={() => router.push(`/audio?festival=${type}` as never)}
      />
      {tracks.slice(0, 3).map((track) => (
        <TrackRow key={track.id} track={track} />
      ))}
    </View>
  );
}
