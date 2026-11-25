import { ActivityIndicator, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { IconTile } from "@/components/IconTile";
import { ERROR_COPY, errorKind } from "@/lib/errors";
import type { IconName } from "@/lib/meta";
import { colors, spacing } from "@/lib/theme";

export { ScreenSkeleton } from "@/components/Skeleton";

/** Small inline spinner; full-screen loads should use <ScreenSkeleton />. */
export function Loading() {
  return (
    <View style={styles.center} accessibilityLabel="Loading">
      <ActivityIndicator size="large" color={colors.saffron} />
    </View>
  );
}

type EmptyProps = {
  icon: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Nothing here yet: say what this place is for and offer the first step. */
export function EmptyState({ icon, title, message, actionLabel, onAction }: EmptyProps) {
  return (
    <View style={styles.block}>
      <View style={styles.art}>
        <IconTile icon={icon} tint={colors.saffronDeep} size={72} />
      </View>
      <AppText variant="title" style={styles.centerText}>
        {title}
      </AppText>
      <AppText color={colors.muted} style={styles.centerText}>
        {message}
      </AppText>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={styles.action} /> : null}
    </View>
  );
}

type ErrorProps = { message: string; onRetry: () => void; status?: number };

/** A failure, explained by what actually failed and with a way forward. */
export function ErrorState({ message, onRetry, status }: ErrorProps) {
  const copy = ERROR_COPY[errorKind(status)];
  const detail = message && message !== copy.title ? message : copy.hint;
  return (
    <View style={styles.center} accessibilityRole="alert">
      <View style={styles.art}>
        <IconTile icon={copy.icon} tint={colors.ink} size={72} />
      </View>
      <AppText variant="title" style={styles.centerText}>
        {copy.title}
      </AppText>
      {detail ? (
        <AppText color={colors.muted} style={styles.centerText}>
          {detail}
        </AppText>
      ) : null}
      <Button label="Try again" icon="refresh" onPress={onRetry} style={styles.action} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  // Sized by its content, so it also works inside a scrolling page (no height to share there).
  block: { alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, gap: spacing.md },
  centerText: { textAlign: "center", maxWidth: 360 },
  art: { marginBottom: spacing.sm },
  action: { marginTop: spacing.md, minWidth: 180 },
});
