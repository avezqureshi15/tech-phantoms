import { BlurView } from "expo-blur";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { colors } from "@/lib/theme";

/** True when the person asked iOS for less transparency: glass then becomes a plain surface. */
export function useReduceTransparency(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduce);
    const subscription = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduce);
    return () => subscription.remove();
  }, []);
  return reduce;
}

// Native liquid glass needs iOS 26; some betas lack the API and can crash, so check both.
const NATIVE_GLASS = Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

type Props = {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** A colour the glass is tinted with, e.g. the brand colour behind a hero. */
  tint?: string;
  /** Blur strength where native glass is not available (iOS before 26). */
  intensity?: number;
  /** Reacts to touch, like Apple's own controls. */
  interactive?: boolean;
  radius?: number;
};

/**
 * One frosted-glass surface for the whole app.
 * iOS 26+: Apple's liquid glass. Older iOS: a blur. Android, and anyone who has turned on
 * Reduce Transparency: a solid translucent surface with the same shape and border, so layouts are
 * identical everywhere and only the material changes.
 */
export function Glass({ children, style, tint, intensity = 45, interactive = false, radius = 22 }: Props) {
  const reduceTransparency = useReduceTransparency();
  const shape: ViewStyle = { borderRadius: radius, overflow: "hidden" };

  if (NATIVE_GLASS && !reduceTransparency) {
    return (
      <GlassView glassEffectStyle="regular" tintColor={tint} isInteractive={interactive} style={[shape, style]}>
        {children}
      </GlassView>
    );
  }

  if (Platform.OS === "ios" && !reduceTransparency) {
    return (
      <BlurView tint="systemChromeMaterialLight" intensity={intensity} style={[shape, styles.edge, style]}>
        {tint ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.12 }]} />
        : null}
        {children}
      </BlurView>
    );
  }

  return (
    <View style={[shape, styles.edge, styles.solid, tint && { backgroundColor: tint }, style]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  edge: { borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.7)" },
  solid: { backgroundColor: "rgba(255,255,255,0.88)", borderColor: colors.line },
});
