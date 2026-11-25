import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { GroupBadge } from "@/components/GroupBadge";
import { Screen } from "@/components/Screen";
import { useActiveHousehold, useHouseholds } from "@/features/queries";
import { setActiveGroup } from "@/lib/active-group";
import { GROUP_KINDS } from "@/lib/meta";
import { colors, spacing } from "@/lib/theme";

/** Switch between the groups the person belongs to, or start a new one. */
export default function GroupSwitcher() {
  const { data: groups = [] } = useHouseholds();
  const { household: active } = useActiveHousehold();

  return (
    <Screen>
      <View style={{ gap: spacing.md }}>
        {groups.map((group) => {
          const selected = group.id === active?.id;
          return (
            <Card
              key={group.id}
              accessibilityLabel={`${group.name}${selected ? ", current group" : ""}`}
              onPress={() => {
                setActiveGroup(group.id);
                router.back();
              }}
            >
              <View style={styles.row}>
                <GroupBadge group={group} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="heading" numberOfLines={1}>
                    {group.name}
                  </AppText>
                  <AppText variant="caption" color={colors.muted}>
                    {GROUP_KINDS.find((k) => k.value === group.kind)?.label}
                    {group.location ? ` · ${group.location}` : ""}
                  </AppText>
                </View>
                {selected ? <Ionicons name="checkmark-circle" size={24} color={colors.success} /> : null}
              </View>
            </Card>
          );
        })}
      </View>
      <Button label="New group" icon="add" variant="secondary" onPress={() => router.push("/group/new")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
