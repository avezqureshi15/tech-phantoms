import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { IconTile } from "@/components/IconTile";
import { ListRow } from "@/components/ListRow";
import { FadeInUp, PressableScale } from "@/components/Motion";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ConfigurationError } from "@/lib/config";
import type { IconName } from "@/lib/meta";
import { colors, radius, spacing } from "@/lib/theme";

const HIGHLIGHTS: readonly { icon: IconName; title: string; text: string }[] = [
  { icon: "flame", title: "Keep traditions alive", text: "Record the rituals and recipes that make your festivals yours." },
  { icon: "calendar", title: "Plan together", text: "Every event, every day of the festival, in one shared place." },
  { icon: "people", title: "One family space", text: "Invite everyone — from grandparents to cousins." },
];

export default function SignInScreen() {
  const { signInWithGoogle } = useAuth();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPress = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(
        e instanceof ApiError || e instanceof ConfigurationError
          ? e.message
          : "We couldn't sign you in with Google. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.lg }]}>
      <FadeInUp style={styles.hero}>
        <View style={styles.mark}>
          <Ionicons name="flame" size={38} color={colors.white} />
        </View>
        <AppText variant="display" style={styles.title}>
          FestiveOS
        </AppText>
        <AppText color={colors.muted} style={styles.tagline}>
          Every festival, every family, every memory, in one place.
        </AppText>
      </FadeInUp>

      <View style={styles.highlights}>
        {HIGHLIGHTS.map((item, index) => (
          <FadeInUp key={item.title} delay={150 + index * 90}>
            <ListRow
              leading={<IconTile icon={item.icon} size={44} />}
              title={item.title}
              subtitle={item.text}
            />
          </FadeInUp>
        ))}
      </View>

      <FadeInUp delay={450} style={styles.actions}>
        {error ? (
          <AppText variant="label" color={colors.danger} style={styles.center} accessibilityLiveRegion="polite">
            {error}
          </AppText>
        ) : null}
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={onPress}
          style={[styles.google, busy && { opacity: 0.7 }]}
        >
          <Ionicons name="logo-google" size={20} color={colors.white} />
          <AppText variant="heading" color={colors.white}>
            {busy ? "Signing in…" : "Continue with Google"}
          </AppText>
        </PressableScale>
        <AppText variant="caption" color={colors.muted} style={styles.center}>
          We only use your name, email and photo to set up your space.
        </AppText>
      </FadeInUp>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: "space-between", backgroundColor: colors.cream },
  hero: { alignItems: "center", gap: spacing.sm },
  mark: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: colors.saffronDeep,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: { fontSize: 36, lineHeight: 42 },
  tagline: { textAlign: "center", maxWidth: 290 },
  highlights: { gap: spacing.md },
  actions: { gap: spacing.md },
  google: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.maroon,
    borderRadius: radius.md,
    minHeight: 54,
  },
  center: { textAlign: "center" },
});
