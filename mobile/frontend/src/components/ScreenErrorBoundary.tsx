import type { ErrorBoundaryProps } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/Button";
import { IconTile } from "@/components/IconTile";
import { AppText } from "@/components/AppText";
import { colors, spacing } from "@/lib/theme";

/**
 * Shown when a screen crashes while rendering, instead of a blank screen or a red box in
 * production. Exported by the root layout so every route is covered.
 */
export function ScreenErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.root} accessibilityRole="alert">
      <IconTile icon="warning" tint={colors.danger} size={72} />
      <AppText variant="title" style={styles.text}>
        Something broke on our side
      </AppText>
      <AppText color={colors.muted} style={styles.text}>
        Nothing you entered was lost. Try again, and if it keeps happening, restart the app.
      </AppText>
      <Button label="Try again" icon="refresh" onPress={() => void retry()} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl, backgroundColor: colors.cream },
  text: { textAlign: "center", maxWidth: 360 },
  button: { marginTop: spacing.md, minWidth: 180 },
});
