import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Chip } from "@/components/Chip";
import { IconTile } from "@/components/IconTile";
import { ListRow } from "@/components/ListRow";
import { SectionTitle } from "@/components/Rows";
import { Screen } from "@/components/Screen";
import { useCities, useFeatures, useUpdateProfile } from "@/features/queries";
import { useAuth, useCurrentUser } from "@/lib/auth";
import { FAITHS } from "@/lib/meta";
import { draftOf, isDirty, toggleFaith, toUpdate } from "@/lib/profile";
import { colors, spacing } from "@/lib/theme";

export default function ProfileScreen() {
  const user = useCurrentUser();
  const { signOut, deleteAccount } = useAuth();
  const features = useFeatures();
  const cities = useCities();
  const save = useUpdateProfile();
  const [draft, setDraft] = useState(() => draftOf(user));
  const [saved, setSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const dirty = isDirty(user, draft);

  const edit = (next: typeof draft) => {
    setSaved(false);
    setDraft(next);
  };

  const submit = () =>
    save.mutate(toUpdate(user, draft), {
      onSuccess: () => {
        setSaved(true);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      onError: (error) => Alert.alert("Couldn't save", error.message),
    });

  const confirmSignOut = async () => {
    setSigningOut(true);
    await signOut();
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      "Delete your account?",
      "This permanently deletes your account and removes you from every family. Families you're alone in are deleted with you. Traditions you recorded stay with your family. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete my account",
          style: "destructive",
          onPress: () => {
            setDeleting(true);
            deleteAccount().catch((error: Error) => {
              setDeleting(false);
              Alert.alert("Couldn't delete your account", error.message);
            });
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Card style={styles.identity}>
        <Avatar name={user.name} uri={user.avatar_url} size={84} />
        <View style={styles.identityText}>
          <AppText variant="title" style={styles.center} numberOfLines={2}>
            {user.name}
          </AppText>
          <AppText color={colors.muted} style={styles.center} numberOfLines={1}>
            {user.email}
          </AppText>
        </View>
      </Card>

      <View style={{ gap: spacing.sm }}>
        <SectionTitle title="Faiths you celebrate" />
        <AppText variant="caption" color={colors.muted}>
          Used to suggest the right festivals and dates. Choose as many as you like, or none.
        </AppText>
        <View style={styles.chips}>
          {FAITHS.map((faith) => (
            <Chip
              key={faith.value}
              label={faith.label}
              icon={faith.icon}
              selected={draft.faiths.includes(faith.value)}
              onPress={() => edit({ ...draft, faiths: toggleFaith(draft.faiths, faith.value) })}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionTitle title="Your city" />
        <AppText variant="caption" color={colors.muted}>
          Used for sunrise, sunset and festival timings.
        </AppText>
        <View style={styles.chips}>
          <Chip label="Not set" selected={draft.homeCity === null} onPress={() => edit({ ...draft, homeCity: null })} />
          {(cities.data ?? []).map((city) => (
            <Chip
              key={city.key}
              label={city.name}
              selected={draft.homeCity === city.key}
              onPress={() => edit({ ...draft, homeCity: city.key })}
            />
          ))}
        </View>
        {cities.isError ? (
          <AppText variant="caption" color={colors.danger}>
            Couldn&apos;t load the cities. Pull down on the previous page and try again.
          </AppText>
        ) : null}
      </View>

      {dirty ? (
        <Button label="Save changes" loading={save.isPending} onPress={submit} />
      ) : saved ? (
        <AppText color={colors.success} style={styles.center} accessibilityLiveRegion="polite">
          Saved
        </AppText>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <SectionTitle title="Shortcuts" />
        <ListRow
          leading={<IconTile icon="people" />}
          title="Your groups"
          subtitle="Switch or start a group"
          onPress={() => router.push("/group")}
        />
        <ListRow
          leading={<IconTile icon="color-palette" />}
          title="Appearance"
          subtitle="Choose your festive pattern"
          onPress={() => router.push("/appearance")}
        />
        {features.on("support_callback") ? (
          <ListRow
            leading={<IconTile icon="call" />}
            title="Get a call back"
            subtitle="Our team phones you, in your language"
            onPress={() => router.push("/support")}
          />
        ) : null}
      </View>

      <View style={{ gap: spacing.md }}>
        <SectionTitle title="Account" />
        <Button
          label="Sign out"
          variant="secondary"
          icon="log-out-outline"
          loading={signingOut}
          onPress={confirmSignOut}
        />
        <Button
          label="Delete my account"
          variant="danger"
          icon="trash-outline"
          loading={deleting}
          onPress={confirmDeleteAccount}
        />
        <AppText variant="caption" color={colors.muted} style={styles.center}>
          FestiveOS {Constants.expoConfig?.version ?? ""}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl },
  identityText: { alignItems: "center", gap: 2, alignSelf: "stretch" },
  center: { textAlign: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
