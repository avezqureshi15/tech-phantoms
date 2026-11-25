import { useState } from "react";
import { View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Field } from "@/components/Field";
import { GroupBadge } from "@/components/GroupBadge";
import { IconPicker } from "@/components/IconPicker";
import { GROUP_KINDS, type GroupKind } from "@/lib/meta";
import { colors, spacing } from "@/lib/theme";

export type GroupDraft = {
  name: string;
  kind: GroupKind;
  icon: string | null;
  color: string | null;
  location: string;
};

type Props = {
  initialName?: string;
  submitLabel: string;
  loading: boolean;
  error?: string | null;
  onSubmit: (draft: GroupDraft) => void;
};

const NAME_HINT: Record<GroupKind, string> = {
  household: "The Sharma Family",
  friends: "Weekend gang",
  office: "Design team",
  other: "Our group",
};

/** Everything needed to create a group: what it is, what it is called, how it looks. */
export function GroupForm({ initialName = "", submitLabel, loading, error, onSubmit }: Props) {
  const [draft, setDraft] = useState<GroupDraft>({
    name: initialName,
    kind: "household",
    icon: null,
    color: null,
    location: "",
  });
  const [problem, setProblem] = useState<string | null>(null);
  const hint = GROUP_KINDS.find((k) => k.value === draft.kind)?.hint;

  const submit = () => {
    if (!draft.name.trim()) return setProblem("Give your group a name.");
    setProblem(null);
    onSubmit({ ...draft, name: draft.name.trim(), location: draft.location.trim() });
  };

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ alignItems: "center", gap: spacing.sm }}>
        <GroupBadge group={draft} size={72} />
        <AppText variant="caption" color={colors.muted}>
          {hint}
        </AppText>
      </View>

      <SegmentedControl
        value={draft.kind}
        onChange={(kind) => setDraft({ ...draft, kind })}
        options={GROUP_KINDS.map((k) => ({ value: k.value, label: k.label }))}
      />

      <Field
        label="Group name"
        value={draft.name}
        onChangeText={(name) => setDraft({ ...draft, name })}
        placeholder={NAME_HINT[draft.kind]}
        autoCapitalize="words"
        maxLength={100}
        error={problem}
      />
      <Field
        label="Where? (optional)"
        value={draft.location}
        onChangeText={(location) => setDraft({ ...draft, location })}
        placeholder="Bengaluru, Karnataka"
        maxLength={200}
      />

      <IconPicker
        icon={draft.icon}
        color={draft.color}
        onChange={({ icon, color }) => setDraft({ ...draft, icon, color })}
      />

      {error ? (
        <AppText variant="label" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
      <Button label={submitLabel} loading={loading} onPress={submit} />
    </View>
  );
}
