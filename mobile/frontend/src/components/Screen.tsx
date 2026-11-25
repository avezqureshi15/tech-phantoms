import { createContext, use, type ReactNode } from "react";
import { RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Backdrop } from "@/components/Backdrop";
import { useLayout } from "@/lib/layout";
import { colors, layout, spacing } from "@/lib/theme";

/** Space a screen must leave at the bottom for the floating tab bar (0 outside the tabs). */
export const TabBarSpace = createContext(0);

type Props = {
  children: ReactNode;
  /** Pad for the status bar; turn off when a navigation header is already shown. */
  topInset?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({ children, topInset = false, refreshing, onRefresh, contentStyle }: Props) {
  const insets = useSafeAreaInsets();
  const tabBarSpace = use(TabBarSpace);
  const { isTablet, width } = useLayout();
  // On a tablet the column is centred; the side margin is whatever the column leaves over.
  const sideGutter = isTablet ? Math.max(spacing.lg, (width - layout.maxContentWidth) / 2) : spacing.lg;

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <Backdrop />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        // Screens with a navigation bar let iOS reserve room for it; header-less tab screens pad themselves.
        contentInsetAdjustmentBehavior={topInset ? "never" : "automatic"}
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing ?? false}
              onRefresh={onRefresh}
              tintColor={colors.saffron}
              colors={[colors.saffron]}
            />
          ) : undefined
        }
        contentContainerStyle={[
          {
            paddingHorizontal: sideGutter,
            paddingTop: spacing.lg + (topInset ? insets.top : 0),
            paddingBottom: spacing.xxl + (tabBarSpace || insets.bottom),
            gap: spacing.lg,
          },
          contentStyle,
        ]}
      >
        {children}
      </ScrollView>
    </View>
  );
}
