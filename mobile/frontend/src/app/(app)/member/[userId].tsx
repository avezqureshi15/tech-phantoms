import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { ChipSelect } from "@/components/Chip";
import { FieldGroup } from "@/components/Field";
import { Screen } from "@/components/Screen";
import { ErrorState, Loading } from "@/components/States";
import { errorProps } from "@/lib/errors";
import {
  useActiveHousehold,
  useHousehold,
  useIsAdmin,
  useRemoveMember,
  useUpdateMember,
} from "@/features/queries";
import { useCurrentUser } from "@/lib/auth";
import { RELATIONSHIPS, titleCase } from "@/lib/meta";
import type { Member } from "@/lib/schemas";
import { colors, spacing } from "@/lib/theme";

const NOT_SET = "NOT_SET";
const RELATIONSHIP_OPTIONS = [
  { value: NOT_SET, label: "Not set" },
  ...RELATIONSHIPS.map((value) => ({ value: value as string, label: titleCase(value) })),
];
const ROLE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
] as const;
const NOTIFICATION_OPTIONS = [
  { value: "all", label: "Everything" },
  { value: "important", label: "Important only" },
  { value: "none", label: "Muted" },
];

export default function MemberScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { household } = useActiveHousehold();
  const detail = useHousehold(household?.id);

  if (!detail.data) {
    return detail.isError ? (
      <ErrorState {...errorProps(detail.error)} onRetry={() => void detail.refetch()} />
    ) : (
      <Loading />
    );
  }

  const member = detail.data.members.find((m) => m.user.id === userId);
  if (!member) {
    return <ErrorState message="This person is no longer in your family." onRetry={() => router.back()} />;
  }
  return (
    <MemberForm
      householdId={detail.data.id}
      member={member}
      memberCount={detail.data.members.length}
    />
  );
}

function MemberForm({
  householdId,
  member,
  memberCount,
}: {
  householdId: string;
  member: Member;
  memberCount: number;
}) {
  const me = useCurrentUser();
  const isAdmin = useIsAdmin(householdId);
  const isSelf = member.user.id === me.id;
  const update = useUpdateMember(householdId);
  const remove = useRemoveMember(householdId);

  const [role, setRole] = useState<string>(member.role);
  const [relationship, setRelationship] = useState<string>(member.relationship ?? NOT_SET);
  const [notifications, setNotifications] = useState<string>(member.notification_preference);

  const changed =
    role !== member.role ||
    relationship !== (member.relationship ?? NOT_SET) ||
    notifications !== member.notification_preference;

  const save = () => {
    update.mutate(
      {
        userId: member.user.id,
        ...(role !== member.role && { role: role as "admin" | "member" }),
        ...(relationship !== (member.relationship ?? NOT_SET) && {
          relationship: relationship === NOT_SET ? null : relationship,
        }),
        ...(notifications !== member.notification_preference && {
          notification_preference: notifications,
        }),
      },
      { onSuccess: () => router.back() },
    );
  };

  const confirmRemove = () => {
    const title = isSelf ? "Leave this family?" : `Remove ${member.user.name}?`;
    const message = isSelf
      ? "You'll lose access to its festivals and traditions until an admin adds you again."
      : "They'll lose access to the family's festivals and traditions.";
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: isSelf ? "Leave" : "Remove",
        style: "destructive",
        onPress: () =>
          remove.mutate(
            { userId: member.user.id, isSelf },
            {
              onSuccess: () => (isSelf ? router.replace("/") : router.back()),
              onError: (error) => Alert.alert("Couldn't do that", error.message),
            },
          ),
      },
    ]);
  };

  return (
    <Screen>
      <View style={{ alignItems: "center", gap: spacing.sm }}>
        <Avatar name={member.user.name} uri={member.user.avatar_url} size={72} />
        <AppText variant="title">{member.user.name}</AppText>
        {isSelf ? <AppText color={colors.muted}>This is you</AppText> : null}
      </View>

      <FieldGroup label="Role">
        {isAdmin ? (
          <ChipSelect options={ROLE_OPTIONS} value={role as "member" | "admin"} onChange={setRole} />
        ) : (
          <AppText>{titleCase(member.role)}</AppText>
        )}
        {isAdmin ? (
          <AppText variant="caption" color={colors.muted}>
            Admins can add festivals and events, and manage who is in the family.
          </AppText>
        ) : null}
      </FieldGroup>

      {isAdmin || isSelf ? (
        <>
          <FieldGroup label="Relationship">
            <ChipSelect options={RELATIONSHIP_OPTIONS} value={relationship} onChange={setRelationship} />
          </FieldGroup>
          <FieldGroup label="Notifications">
            <ChipSelect options={NOTIFICATION_OPTIONS} value={notifications} onChange={setNotifications} />
          </FieldGroup>
        </>
      ) : null}

      {update.error ? (
        <AppText variant="label" color={colors.danger} accessibilityLiveRegion="polite">
          {update.error.message}
        </AppText>
      ) : null}

      <Button label="Save changes" loading={update.isPending} disabled={!changed} onPress={save} />

      {(isAdmin || isSelf) && memberCount > 1 ? (
        <Button
          label={isSelf ? "Leave family" : "Remove from family"}
          variant="danger"
          loading={remove.isPending}
          onPress={confirmRemove}
        />
      ) : null}
    </Screen>
  );
}
