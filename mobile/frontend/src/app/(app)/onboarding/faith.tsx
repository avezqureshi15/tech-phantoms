import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Glass } from "@/components/Glass";
import { useUpdateProfile } from "@/features/queries";
import { useCurrentUser } from "@/lib/auth";
import { FAITHS } from "@/lib/meta";
import { colors, spacing } from "@/lib/theme";

/**
 * Asked once, right after sign-in. It decides which calendar, festivals and daily page the person
 * sees (a panchang for Hindu users, Hijri dates and prayer times for Muslim users, and so on).
 * "Prefer not to say" is a real answer: it records that we asked and shows a general page.
 */
export default function FaithScreen() {
  const user = useCurrentUser();
  const insets = useSafeAreaInsets();
  const save = useUpdateProfile();
  const [chosen, setChosen] = useState<string[]>([]);

  const toggle = (value: string) =>
    setChosen((current) => (current.includes(value) ? current.filter((v) => v !== value) : [...current, value]));

  return (
    <LinearGradient
      colors={[colors.maroonDark, colors.maroon, colors.saffronDeep]}
      style={[styles.root, { paddingTop: insets.top + spacing.xl }]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.xl, paddingBottom: insets.bottom + spacing.xl }}
      >
        <View style={{ gap: spacing.sm }}>
          <AppText variant="display" color={colors.white}>
            Hello, {user.name.split(" ")[0]}
          </AppText>
          <AppText color="rgba(255,255,255,0.88)">
            What do you celebrate? We use this to show the right calendar and festivals for you. You
            can choose more than one, and change it any time.
          </AppText>
        </View>

        <View style={{ gap: spacing.sm }}>
          {FAITHS.map((faith) => {
            const selected = chosen.includes(faith.value);
            return (
              <Pressable
                key={faith.value}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={faith.label}
                onPress={() => toggle(faith.value)}
              >
                <Glass tint={selected ? colors.marigold : undefined} interactive style={styles.option}>
                  <View style={styles.optionRow}>
                    <Ionicons name={faith.icon} size={22} color={colors.white} />
                    <AppText variant="heading" color={colors.white} style={{ flex: 1 }}>
                      {faith.label}
                    </AppText>
                    <Ionicons
                      name={selected ? "checkmark-circle" : "ellipse-outline"}
                      size={24}
                      color={selected ? colors.marigold : "rgba(255,255,255,0.6)"}
                    />
                  </View>
                </Glass>
              </Pressable>
            );
          })}
        </View>

        {save.error ? (
          <AppText variant="label" color="#FFD2CC" accessibilityLiveRegion="polite">
            {save.error.message}
          </AppText>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Button
            label={chosen.length ? "Continue" : "Continue without choosing"}
            loading={save.isPending}
            onPress={() => save.mutate({ faiths: chosen })}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => save.mutate({ faiths: [] })}
            style={styles.skip}
          >
            <AppText variant="heading" color={colors.white}>
              Prefer not to say
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.xl },
  option: { paddingHorizontal: spacing.lg, paddingVertical: 16 },
  skip: { alignItems: "center", paddingVertical: spacing.md },
  optionRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
