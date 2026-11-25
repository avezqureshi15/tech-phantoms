import * as Haptics from "expo-haptics";
import type { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Glass } from "@/components/Glass";
import { colors } from "@/lib/theme";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const BAR_HEIGHT = 64;
const GAP = 10;

/** How much room screens must leave beneath their content so the bar never covers it. */
export const tabBarSpace = (bottomInset: number) => BAR_HEIGHT + GAP * 2 + bottomInset;

/**
 * A floating glass pill for the tabs. Pages scroll underneath it, which is what the glass refracts,
 * so it only needs a light tint. Tabs whose route has `href: null` are not shown.
 */
export function TabBar({ state, descriptors, emitter, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const visible = state.routes.filter(
    (route) => (descriptors[route.key]?.options as { href?: unknown } | undefined)?.href !== null,
  );

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, GAP) }]}>
      <Glass radius={BAR_HEIGHT / 2} tint="rgba(255,255,255,0.4)" style={styles.bar}>
        <View style={styles.row}>
          {visible.map((route) => {
            const { options } = descriptors[route.key]!;
            const focused = state.routes[state.index]?.key === route.key;
            const label = typeof options.title === "string" ? options.title : route.name;
            const color = focused ? colors.saffronDeep : colors.muted;
            const icon = options.tabBarIcon?.({ focused, color, size: 24 });

            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={label}
                onPress={() => {
                  const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) {
                    void Haptics.selectionAsync();
                    navigateToTab(route.key);
                  }
                }}
                onLongPress={() => emitter.emit({ type: "tabLongPress", target: route.key })}
                style={styles.item}
              >
                <View style={[styles.pill, focused && styles.pillActive]}>
                  {icon}
                  <AppText variant="caption" color={color} style={styles.label} numberOfLines={1}>
                    {label}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 14, right: 14, alignItems: "center" },
  bar: { width: "100%", maxWidth: 520, height: BAR_HEIGHT },
  row: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 6 },
  item: { flex: 1, height: "100%", alignItems: "center", justifyContent: "center" },
  pill: {
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 22,
    minWidth: 58,
  },
  pillActive: { backgroundColor: "rgba(194,65,12,0.12)" },
  label: { fontSize: 10, lineHeight: 12 },
});
