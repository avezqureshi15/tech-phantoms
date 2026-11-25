import { Ionicons } from "@expo/vector-icons";
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
import { PageHeader, SectionTitle } from "@/components/Rows";
import { Screen } from "@/components/Screen";
import { ErrorState, ScreenSkeleton } from "@/components/States";
import { errorProps } from "@/lib/errors";
import {
  useActiveHousehold,
  useDeleteHousehold,
  useHousehold,
  useIsAdmin,
  useUpdateHousehold,
} from "@/features/queries";
import { useAuth, useCurrentUser } from "@/lib/auth";
import { deviceTimeZone, zoneLabel } from "@/lib/clock";
import { titleCase } from "@/lib/meta";
import { colors, spacing } from "@/lib/theme";

export default function FamilyScreen() {
  const user = useCurrentUser();
  const { signOut, deleteAccount } = useAuth();
  const { household } = useActiveHousehold();
  const detail = useHousehold(household?.id);
  const isAdmin = useIsAdmin(household?.id);
  const [signingOut, setSigningOut] = useState(false);
  const deleteHousehold = useDeleteHousehold(household?.id ?? "");
  const updateHousehold = useUpdateHousehold(household?.id ?? "");
  const [deletingAccount, setDeletingAccount] = useState(false);

  if (!detail.data) {
    return detail.isError ? (
      <ErrorState {...errorProps(detail.error)} onRetry={() => void detail.refetch()} />
    ) : (
      <ScreenSkeleton />
    );
  }

  // The only member is always the admin, and has no one to hand the family over to.
  const canDeleteFamily = isAdmin && detail.data.members.length === 1;

  const confirmDelete = () => {
    Alert.alert(
      `Delete ${detail.data.name}?`,
      "This permanently deletes the family's festivals, events and traditions, including your history. It can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete forever",
          style: "destructive",
          onPress: () =>
            deleteHousehold.mutate(undefined, {
              onSuccess: () => router.replace("/"),
              onError: (error) => Alert.alert("Couldn't delete", error.message),
            }),
        },
      ],
    );
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
            setDeletingAccount(true);
            deleteAccount().catch((error: Error) => {
              setDeletingAccount(false);
              Alert.alert("Couldn't delete your account", error.message);
            });
          },
        },
      ],
    );
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
  };

  return (
    <Screen topInset refreshing={detail.isRefetching} onRefresh={() => void detail.refetch()}>
      <PageHeader
        title={detail.data.name}
        subtitle={[detail.data.location, detail.data.currency].filter(Boolean).join(" · ")}
        onAdd={isAdmin ? () => router.push("/member/new") : undefined}
        addLabel="Add family member"
      />

      <View style={{ gap: spacing.md }}>
        <SectionTitle title={`Members (${detail.data.members.length})`} />
        {detail.data.members.map((member) => (
          <Card
            key={member.user.id}
            onPress={
              isAdmin || member.user.id === user.id
                ? () => router.push(`/member/${member.user.id}`)
                : undefined
            }
            accessibilityLabel={member.user.name}
          >
            <View style={styles.row}>
              <Avatar name={member.user.name} uri={member.user.avatar_url} size={46} />
              <View style={{ flex: 1 }}>
                <AppText variant="heading">
                  {member.user.name}
                  {member.user.id === user.id ? " (you)" : ""}
                </AppText>
                <AppText variant="caption" color={colors.muted}>
                  {member.relationship ? titleCase(member.relationship) : "Family member"}
                </AppText>
              </View>
              {member.role === "admin" ? <Chip label="Admin" tone="success" /> : null}
              {isAdmin || member.user.id === user.id ? (
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              ) : null}
            </View>
          </Card>
        ))}
      </View>

      {(() => {
        const device = deviceTimeZone();
        const differs = detail.data.timezone !== device;
        return (
          <View style={{ gap: spacing.md }}>
            <SectionTitle title="Time zone" />
            <Card>
              <AppText variant="heading">{zoneLabel(detail.data.timezone)}</AppText>
              <AppText variant="caption" color={colors.muted}>
                {differs
                  ? `Your device is on ${zoneLabel(device)}. Festival days and event times follow the household's zone, so everyone sees the same day.`
                  : "Festival days and event times follow this zone for everyone in the family."}
              </AppText>
            </Card>
            {differs && isAdmin ? (
              <Button
                label="Use my device's time zone"
                variant="secondary"
                icon="time-outline"
                loading={updateHousehold.isPending}
                onPress={() =>
                  updateHousehold.mutate(
                    { timezone: device },
                    { onError: (error) => Alert.alert("Couldn't update", error.message) },
                  )
                }
              />
            ) : null}
          </View>
        );
      })()}

      <View style={{ gap: spacing.md }}>
        <SectionTitle title="Your account" />
        <Card>
          <View style={styles.row}>
            <Avatar name={user.name} uri={user.avatar_url} size={46} />
            <View style={{ flex: 1 }}>
              <AppText variant="heading">{user.name}</AppText>
              <AppText variant="caption" color={colors.muted}>
                {user.email}
              </AppText>
            </View>
          </View>
        </Card>
        <ListRow
          leading={<IconTile icon="color-palette" />}
          title="Appearance"
          subtitle="Choose your festive pattern"
          onPress={() => router.push("/appearance")}
        />
        <Button label="Sign out" variant="secondary" icon="log-out-outline" loading={signingOut} onPress={handleSignOut} />
        <Button
          label="Delete my account"
          variant="danger"
          icon="trash-outline"
          loading={deletingAccount}
          onPress={confirmDeleteAccount}
        />
      </View>

      {canDeleteFamily ? (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle title="Danger zone" />
          <AppText variant="caption" color={colors.muted}>
            {"You're the only member, so you can delete this family. Once others join, you'll need to remove them first."}
          </AppText>
          <Button
            label="Delete this family"
            variant="danger"
            icon="trash-outline"
            loading={deleteHousehold.isPending}
            onPress={confirmDelete}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
