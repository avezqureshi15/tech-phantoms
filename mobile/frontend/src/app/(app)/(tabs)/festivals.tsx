import { router } from "expo-router";

import { Screen } from "@/components/Screen";
import { FestivalRow, PageHeader, SectionTitle } from "@/components/Rows";
import { EmptyState, ErrorState, ScreenSkeleton } from "@/components/States";
import { errorProps } from "@/lib/errors";
import { useActiveHousehold, useFestivals, useIsAdmin } from "@/features/queries";
import { useToday } from "@/lib/clock-context";
import { daysUntil } from "@/lib/dates";
import { View } from "react-native";
import { spacing } from "@/lib/theme";

export default function FestivalsScreen() {
  const today = useToday();
  const { household } = useActiveHousehold();
  const isAdmin = useIsAdmin(household?.id);
  const festivals = useFestivals(household?.id);

  if (!festivals.data) {
    return festivals.isError ? (
      <ErrorState {...errorProps(festivals.error)} onRetry={() => void festivals.refetch()} />
    ) : (
      <ScreenSkeleton />
    );
  }

  const all = [...festivals.data].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const upcoming = all.filter((f) => daysUntil(f.end_date, today) >= 0);
  const past = all.filter((f) => daysUntil(f.end_date, today) < 0).reverse();

  return (
    <Screen
      topInset
      refreshing={festivals.isRefetching}
      onRefresh={() => void festivals.refetch()}
    >
      <PageHeader
        title="Festivals"
        subtitle={household?.name}
        onAdd={isAdmin ? () => router.push("/festival/new") : undefined}
        addLabel="Add festival"
      />

      {all.length === 0 ? (
        <View style={{ minHeight: 360 }}>
          <EmptyState
            icon="calendar"
            title="No festivals yet"
            message={
              isAdmin
                ? "Add the first festival your family is celebrating."
                : "A household admin can add the first festival."
            }
            actionLabel={isAdmin ? "Add a festival" : undefined}
            onAction={isAdmin ? () => router.push("/festival/new") : undefined}
          />
        </View>
      ) : null}

      {upcoming.length > 0 ? (
        <View style={{ gap: spacing.md }}>
          <SectionTitle title="Upcoming & ongoing" />
          {upcoming.map((festival) => (
            <FestivalRow
              key={festival.id}
              festival={festival}
              onPress={() => router.push(`/festival/${festival.id}`)}
            />
          ))}
        </View>
      ) : null}

      {past.length > 0 ? (
        <View style={{ gap: spacing.md }}>
          <SectionTitle title="Past celebrations" />
          {past.map((festival) => (
            <FestivalRow
              key={festival.id}
              festival={festival}
              onPress={() => router.push(`/festival/${festival.id}`)}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
