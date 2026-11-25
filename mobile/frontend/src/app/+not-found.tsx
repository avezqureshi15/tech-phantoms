import { Link, Stack } from "expo-router";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { IconTile } from "@/components/IconTile";
import { colors, spacing } from "@/lib/theme";

/** A link or route that does not exist: say so plainly and lead back to safety. */
export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found", headerShown: false }} />
      <View style={styles.root}>
        <IconTile icon="compass" tint={colors.maroon} size={72} />
        <AppText variant="title" style={styles.text}>
          That page doesn&apos;t exist
        </AppText>
        <AppText color={colors.muted} style={styles.text}>
          The link may be old or mistyped.
        </AppText>
        <Link href="/" replace style={styles.link}>
          <AppText variant="heading" color={colors.saffronDeep}>
            Go to Home
          </AppText>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl, backgroundColor: colors.cream },
  text: { textAlign: "center", maxWidth: 360 },
  link: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
});
