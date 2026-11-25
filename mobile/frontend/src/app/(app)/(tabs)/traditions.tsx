import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Chip } from "@/components/Chip";
import { PageHeader, TraditionRow } from "@/components/Rows";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, ScreenSkeleton } from "@/components/States";
import { errorProps } from "@/lib/errors";
import { useActiveHousehold, useTraditions } from "@/features/queries";
import { festivalMeta } from "@/lib/meta";
import { spacing } from "@/lib/theme";

export default function TraditionsScreen() {
  const { household } = useActiveHousehold();
  const traditions = useTraditions(household?.id);
  const [filter, setFilter] = useState<string | null>(null);

  if (!traditions.data) {
    return traditions.isError ? (
      <ErrorState {...errorProps(traditions.error)} onRetry={() => void traditions.refetch()} />
    ) : (
      <ScreenSkeleton />
    );
  }

  const festivalTypes = [...new Set(traditions.data.map((t) => t.festival_type))].sort();
  const visible = traditions.data.filter((t) => !filter || t.festival_type === filter);

  return (
    <Screen
      topInset
      refreshing={traditions.isRefetching}
      onRefresh={() => void traditions.refetch()}
    >
      <PageHeader
        title="Traditions"
        subtitle="How your family celebrates"
        onAdd={() => router.push("/tradition/new")}
        addLabel="Add tradition"
      />

      {festivalTypes.length > 1 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <Chip label="All" selected={filter === null} onPress={() => setFilter(null)} />
          {festivalTypes.map((type) => (
            <Chip
              key={type}
              label={festivalMeta(type).label}
              icon={festivalMeta(type).icon}
              selected={filter === type}
              onPress={() => setFilter(type)}
            />
          ))}
        </View>
      ) : null}

      {visible.length === 0 ? (
        <View style={{ minHeight: 360 }}>
          <EmptyState
            icon="flame"
            title="Your traditions live here"
            message="Record the rituals, recipes and little habits that make your festivals yours — and pass them down."
            actionLabel="Add a tradition"
            onAction={() => router.push("/tradition/new")}
          />
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          {visible.map((tradition) => (
            <TraditionRow
              key={tradition.id}
              tradition={tradition}
              onPress={() => router.push(`/tradition/${tradition.id}`)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
