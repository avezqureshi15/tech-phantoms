import { useEffect, useState } from "react";
import { Animated, Easing, View, type DimensionValue } from "react-native";

import { Screen } from "@/components/Screen";
import { colors, radius, spacing } from "@/lib/theme";

export function SkeletonBlock({
  height,
  width = "100%",
  round = radius.md,
}: {
  height: number;
  width?: DimensionValue;
  round?: number;
}) {
  const [shimmer] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  return (
    <Animated.View
      style={{
        height,
        width,
        borderRadius: round,
        backgroundColor: colors.sand,
        opacity: shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
      }}
    />
  );
}

/** Placeholder shaped like a typical screen. Pass `topInset={false}` under a navigation header. */
export function ScreenSkeleton({ topInset = true }: { topInset?: boolean }) {
  return (
    <Screen topInset={topInset}>
      <View accessibilityLabel="Loading" style={{ gap: spacing.lg }}>
        <SkeletonBlock height={44} width="55%" round={12} />
        <SkeletonBlock height={190} round={28} />
        <SkeletonBlock height={72} />
        <SkeletonBlock height={72} />
        <SkeletonBlock height={72} />
      </View>
    </Screen>
  );
}
