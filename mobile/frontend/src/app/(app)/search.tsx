import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/States";
import { useSearch } from "@/features/queries";
import { setActiveGroup } from "@/lib/active-group";
import type { IconName } from "@/lib/meta";
import type { SearchResult } from "@/lib/schemas";
import { colors, fonts, radius, spacing } from "@/lib/theme";

const DEBOUNCE_MS = 250;
const KIND: Record<SearchResult["kind"], { label: string; icon: IconName }> = {
  group: { label: "Groups", icon: "people" },
  festival: { label: "Festivals", icon: "calendar" },
  tradition: { label: "Traditions", icon: "flame" },
  expense: { label: "Expenses", icon: "wallet" },
  member: { label: "People", icon: "person" },
};
const ORDER: SearchResult["kind"][] = ["group", "festival", "tradition", "expense", "member"];

/** Open a result in the context of the group it belongs to. */
function open(result: SearchResult) {
  setActiveGroup(result.household_id);
  router.dismiss();
  const target: Record<SearchResult["kind"], string> = {
    group: "/",
    festival: `/festival/${result.id}`,
    tradition: `/tradition/${result.id}`,
    expense: `/expense/${result.id}`,
    member: `/member/${result.id}`,
  };
  router.push(target[result.kind] as never);
}

export default function SearchScreen() {
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);
  const search = useSearch(debounced);
  const results = search.data?.results ?? [];
  const typedEnough = debounced.trim().length >= 2;

  return (
    <View style={styles.root}>
      <View style={styles.box}>
        <Ionicons name="search" size={20} color={colors.muted} />
        <TextInput
          autoFocus
          accessibilityLabel="Search"
          value={text}
          onChangeText={setText}
          placeholder="Festivals, people, expenses…"
          placeholderTextColor="#B5A79C"
          returnKeyType="search"
          autoCorrect={false}
          style={styles.input}
        />
        {text ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear" onPress={() => setText("")} hitSlop={10}>
            <Ionicons name="close-circle" size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xxl }}>
        {!typedEnough ? (
          <AppText color={colors.muted}>Type at least two letters to search across all your groups.</AppText>
        ) : search.isError ? (
          <AppText color={colors.danger}>{search.error.message}</AppText>
        ) : results.length === 0 && !search.isFetching ? (
          <View style={{ minHeight: 260 }}>
            <EmptyState icon="search" title="Nothing found" message={`No matches for "${debounced.trim()}".`} />
          </View>
        ) : (
          ORDER.map((kind) => {
            const group = results.filter((r) => r.kind === kind);
            if (group.length === 0) return null;
            return (
              <View key={kind} style={{ gap: spacing.sm }}>
                <AppText variant="eyebrow" color={colors.muted}>
                  {KIND[kind].label}
                </AppText>
                {group.map((r) => (
                  <Card key={`${kind}-${r.id}`} onPress={() => open(r)} accessibilityLabel={`${r.title}, ${r.subtitle}`}>
                    <View style={styles.row}>
                      <Ionicons name={KIND[kind].icon} size={22} color={colors.saffronDeep} />
                      <View style={{ flex: 1 }}>
                        <AppText variant="heading" numberOfLines={1}>
                          {r.title}
                        </AppText>
                        <AppText variant="caption" color={colors.muted}>
                          {r.subtitle}
                        </AppText>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                    </View>
                  </Card>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream, padding: spacing.lg, gap: spacing.lg },
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 50,
  },
  input: { flex: 1, fontSize: 16, fontFamily: fonts.regular, color: colors.ink, paddingVertical: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
