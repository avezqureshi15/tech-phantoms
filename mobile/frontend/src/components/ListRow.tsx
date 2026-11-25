import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { colors, spacing } from "@/lib/theme";

type Props = {
  /** Usually an <IconTile> or an avatar. */
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  /** A value, badge or control on the right. A chevron shows automatically when the row is tappable. */
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
};

/** One consistent row for every list in the app. */
export function ListRow({ leading, title, subtitle, trailing, onPress, accessibilityLabel }: Props) {
  return (
    <Card onPress={onPress} accessibilityLabel={accessibilityLabel ?? title} style={styles.card}>
      <View style={styles.row}>
        {leading}
        <View style={styles.text}>
          <AppText variant="heading" numberOfLines={1}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="caption" color={colors.muted} numberOfLines={2}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null)}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 44 },
  text: { flex: 1, gap: 2 },
});
