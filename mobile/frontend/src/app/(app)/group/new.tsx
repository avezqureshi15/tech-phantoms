import { router } from "expo-router";

import { GroupForm, type GroupDraft } from "@/components/GroupForm";
import { Screen } from "@/components/Screen";
import { useCreateHousehold } from "@/features/queries";
import { setActiveGroup } from "@/lib/active-group";
import { deviceTimeZone } from "@/lib/clock";

/** Create another group (friends, office, a second household) from inside the app. */
export default function NewGroupScreen() {
  const create = useCreateHousehold();

  const submit = (draft: GroupDraft) =>
    create.mutate(
      {
        name: draft.name,
        kind: draft.kind,
        icon: draft.icon,
        color: draft.color,
        location: draft.location || undefined,
        timezone: deviceTimeZone(),
      },
      {
        onSuccess: (group) => {
          setActiveGroup(group.id);
          router.dismissAll();
        },
      },
    );

  return (
    <Screen>
      <GroupForm
        submitLabel="Create group"
        loading={create.isPending}
        error={create.error?.message}
        onSubmit={submit}
      />
    </Screen>
  );
}
