import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { TabBar, tabBarSpace } from "@/components/TabBar";
import { TabBarSpace } from "@/components/Screen";
import { useActiveHousehold } from "@/features/queries";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ColorValue } from "react-native";

import type { IconName } from "@/lib/meta";
import { colors, fonts } from "@/lib/theme";

function tab(title: string, active: IconName, inactive: IconName) {
  return {
    title,
    tabBarIcon: ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
      <Ionicons name={focused ? active : inactive} size={size} color={typeof color === "string" ? color : colors.saffronDeep} />
    ),
  };
}

export default function TabsLayout() {
  const { household } = useActiveHousehold();
  const hasTraditions = household?.kind === "household";
  const insets = useSafeAreaInsets();
  return (
    <TabBarSpace value={tabBarSpace(insets.bottom)}>
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.saffronDeep,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line, paddingTop: 6 },
        sceneStyle: { backgroundColor: colors.cream },
      }}
    >
      <Tabs.Screen name="index" options={tab("Home", "home", "home-outline")} />
      <Tabs.Screen name="festivals" options={tab("Festivals", "calendar", "calendar-outline")} />
      <Tabs.Screen name="expenses" options={tab("Expenses", "wallet", "wallet-outline")} />
      <Tabs.Screen name="today" options={tab("Today", "sunny", "sunny-outline")} />
      {/* Traditions belong to households only; the route stays but the tab disappears elsewhere. */}
      <Tabs.Screen
        name="traditions"
        options={{ ...tab("Traditions", "flame", "flame-outline"), href: hasTraditions ? undefined : null }}
      />
      <Tabs.Screen name="family" options={{ ...tab("Members", "people", "people-outline"), href: null }} />
    </Tabs>
    </TabBarSpace>
  );
}
