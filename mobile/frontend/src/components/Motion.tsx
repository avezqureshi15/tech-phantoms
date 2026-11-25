import { useEffect, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type FadeProps = { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> };

/** Fades and lifts its children in once, staggered by `delay` ms. */
export function FadeInUp({ children, delay = 0, style }: FadeProps) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 480,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [delay, progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// Styles that position or size the component within its parent. They must sit on the
// outermost element, otherwise e.g. `flex: 1` only affects the inner view and the touchable
// itself still shrink-wraps its content.
const LAYOUT_KEYS = new Set([
  "flex", "flexGrow", "flexShrink", "flexBasis", "alignSelf",
  "width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight",
  "margin", "marginTop", "marginBottom", "marginLeft", "marginRight",
  "marginHorizontal", "marginVertical", "marginStart", "marginEnd",
  "position", "top", "bottom", "left", "right", "start", "end", "zIndex", "aspectRatio",
]);

export function splitLayoutStyle(style: StyleProp<ViewStyle>): { outer: ViewStyle; inner: ViewStyle } {
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(StyleSheet.flatten(style) ?? {})) {
    (LAYOUT_KEYS.has(key) ? outer : inner)[key] = value;
  }
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}

type PressableScaleProps = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  /**
   * Let the visual layer grow to fill a taller touch area (a stretched row item). Turn it off for
   * a control sized by its own content: in a scrolling page the growth would fill the viewport.
   */
  fill?: boolean;
};

/** A Pressable that springs down slightly while held. */
export function PressableScale({ children, style, scaleTo = 0.975, fill = true, ...props }: PressableScaleProps) {
  const [scale] = useState(() => new Animated.Value(1));
  const spring = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 40, bounciness: 4 }).start();

  const { outer, inner } = splitLayoutStyle(style);

  return (
    <Pressable {...props} style={outer} onPressIn={() => spring(scaleTo)} onPressOut={() => spring(1)}>
      {/* flexGrow lets the visual layer fill a taller outer box (e.g. a stretched row item). */}
      <Animated.View style={[inner, fill && { flexGrow: 1 }, { transform: [{ scale }] }]}>
        {children as ReactNode}
      </Animated.View>
    </Pressable>
  );
}
