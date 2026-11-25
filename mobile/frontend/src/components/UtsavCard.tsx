import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { PatternSurface } from "@/components/Patterns";
import { colors, MIN_TOUCH, radius, spacing } from "@/lib/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type Way = { key: string; icon: IconName; label: string; hint: string; onPress: () => void };

type Props = {
  /** Which of the three ways in are switched on. A way that is off is simply not shown. */
  ask: boolean;
  talk: boolean;
  pray: boolean;
  onAsk: () => void;
  onTalk: () => void;
  onPray: () => void;
};

/**
 * Utsav in one place: type to it, talk to it, or practise a prayer with it. Three equal doors on one
 * card, instead of three full-width rows that push everything else off the screen.
 */
export function UtsavCard({ ask, talk, pray, onAsk, onTalk, onPray }: Props) {
  const ways: Way[] = [
    ...(ask
      ? [{ key: "ask", icon: "chatbubble-ellipses" as IconName, label: "Ask", hint: "Ask Utsav", onPress: onAsk }]
      : []),
    ...(talk
      ? [{ key: "talk", icon: "mic" as IconName, label: "Talk", hint: "Talk with Utsav", onPress: onTalk }]
      : []),
    ...(pray
      ? [{ key: "pray", icon: "musical-notes" as IconName, label: "Pray", hint: "Practise a prayer", onPress: onPray }]
      : []),
  ];
  if (ways.length === 0) return null;

  return (
    <PatternSurface color={colors.maroon} size={170} style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="sparkles" size={20} color={colors.marigold} />
        <AppText variant="heading" color={colors.white}>
          Utsav
        </AppText>
        <AppText variant="caption" color="rgba(255,255,255,0.7)" style={{ flexShrink: 1 }}>
          your festival guide
        </AppText>
      </View>
      <View style={styles.ways}>
        {ways.map((way) => (
          <Pressable
            key={way.key}
            accessibilityRole="button"
            accessibilityLabel={way.hint}
            onPress={way.onPress}
            style={({ pressed }) => [styles.way, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name={way.icon} size={26} color={colors.white} />
            <AppText variant="label" color={colors.white}>
              {way.label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </PatternSurface>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, gap: spacing.md },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  ways: { flexDirection: "row", gap: spacing.sm },
  way: {
    flex: 1,
    minHeight: MIN_TOUCH + 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
});
