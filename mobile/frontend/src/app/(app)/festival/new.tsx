import { router } from "expo-router";
import { useState } from "react";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { DateField, Field, FieldGroup } from "@/components/Field";
import { Screen } from "@/components/Screen";
import { useActiveHousehold, useCreateFestival } from "@/features/queries";
import { useToday } from "@/lib/clock-context";
import { parseDate, toApiDate } from "@/lib/dates";
import { FestivalPicker } from "@/components/FestivalPicker";
import { useCurrentUser } from "@/lib/auth";
import { defaultFestival, FESTIVAL_TYPES } from "@/lib/meta";
import { colors } from "@/lib/theme";

export default function NewFestivalScreen() {
  const today = useToday();
  const { household } = useActiveHousehold();
  const create = useCreateFestival(household?.id ?? "");

  const user = useCurrentUser();
  const [type, setType] = useState<string>(() => defaultFestival(user.faiths));
  const [name, setName] = useState<string | null>(null);
  const [start, setStart] = useState(() => parseDate(today));
  const [end, setEnd] = useState(() => parseDate(today));
  const [error, setError] = useState<string | null>(null);

  const label = FESTIVAL_TYPES[type]?.label ?? "Festival";
  const effectiveName = name ?? `${label} ${start.getFullYear()}`;

  const submit = () => {
    if (!effectiveName.trim()) return setError("Give the festival a name.");
    if (toApiDate(end) < toApiDate(start)) return setError("The end date can't be before the start date.");
    setError(null);
    create.mutate(
      {
        type,
        name: effectiveName.trim(),
        start_date: toApiDate(start),
        end_date: toApiDate(end),
      },
      { onSuccess: (festival) => router.replace(`/festival/${festival.id}`) },
    );
  };

  return (
    <Screen>
      <FieldGroup label="Which festival?">
        <FestivalPicker value={type} onChange={setType} />
      </FieldGroup>
      <Field label="Name" value={effectiveName} onChangeText={setName} autoCapitalize="words" />
      <DateField
        label="Starts"
        value={start}
        onChange={(date) => {
          setStart(date);
          if (toApiDate(end) < toApiDate(date)) setEnd(date);
        }}
      />
      <DateField label="Ends" value={end} onChange={setEnd} minimumDate={start} />
      {error || create.error ? (
        <AppText variant="label" color={colors.danger} accessibilityLiveRegion="polite">
          {error ?? create.error?.message}
        </AppText>
      ) : null}
      <Button label="Create festival" loading={create.isPending} onPress={submit} />
    </Screen>
  );
}
