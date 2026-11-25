import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { GroupForm, type GroupDraft } from "@/components/GroupForm";
import { IconTile } from "@/components/IconTile";
import { useCreateHousehold } from "@/features/queries";
import { setActiveGroup } from "@/lib/active-group";
import { useAuth, useCurrentUser } from "@/lib/auth";
import { deviceTimeZone } from "@/lib/clock";
import { colors, radius, spacing } from "@/lib/theme";

/** First launch: the person has no group yet. */
export default function FirstGroupScreen() {
  const user = useCurrentUser();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const create = useCreateHousehold();

  const submit = (draft: GroupDraft) =>
    create.mutate(
      {
        name: draft.name,
        kind: draft.kind,
        icon: draft.icon,
        color: draft.color,
        location: draft.location || undefined,
        timezone: deviceTimeZone(), // not the server's default: the group may live anywhere
      },
      { onSuccess: (group) => setActiveGroup(group.id) },
    );

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xl }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: spacing.xl, paddingBottom: insets.bottom + spacing.xl }}
        >
          <View style={{ gap: spacing.sm }}>
            <IconTile icon="people" size={56} />
            <AppText variant="display">
              Welcome, {user.name.split(" ")[0]}
            </AppText>
            <AppText color={colors.muted}>
              Start with a group: your family, your friends or your office. You can add more any time.
            </AppText>
          </View>

          <View style={styles.sheet}>
            <GroupForm
              initialName={`${user.name.split(" ").slice(-1)[0]} Family`}
              submitLabel="Create group"
              loading={create.isPending}
              error={create.error?.message}
              onSubmit={submit}
            />
            <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.xl, backgroundColor: colors.cream },
  sheet: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md, borderWidth: 1, borderColor: colors.line },
});
