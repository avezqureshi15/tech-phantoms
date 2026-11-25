import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { colors, spacing } from "@/lib/theme";

const STEPS = ["Utsav speaks", "Your turn", "Thinking"] as const;

/**
 * Three steps in a row, with the current one lit. A voice conversation has no visible controls, so
 * this answers the question people keep asking: "whose turn is it?".
 */
export function VoiceSteps({ step }: { step: 0 | 1 | 2 | null }) {
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={step === null ? "Conversation steps" : `Step ${step + 1} of 3: ${STEPS[step]}`}
    >
      {STEPS.map((label, index) => {
        const on = step === index;
        return (
          <View key={label} style={[styles.step, on && styles.stepOn]}>
            <View style={[styles.dot, on && styles.dotOn]} />
            <AppText style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
              {label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm, alignSelf: "stretch" },
  step: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  stepOn: { backgroundColor: "rgba(255,255,255,0.20)" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.35)" },
  dotOn: { backgroundColor: colors.white },
  label: { color: "rgba(255,255,255,0.55)", fontSize: 15, lineHeight: 20 },
  labelOn: { color: colors.white },
});
