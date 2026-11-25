import { router } from "expo-router";
import { useState } from "react";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { ChipSelect } from "@/components/Chip";
import { FestivalPicker } from "@/components/FestivalPicker";
import { Field, FieldGroup } from "@/components/Field";
import { Screen } from "@/components/Screen";
import { useActiveHousehold, useCreateTradition } from "@/features/queries";
import { useToday } from "@/lib/clock-context";
import { CATEGORIES, SCOPES } from "@/lib/meta";
import { colors } from "@/lib/theme";

const CATEGORY_OPTIONS = Object.entries(CATEGORIES).map(([value, meta]) => ({
  value,
  label: meta.label,
  icon: meta.icon,
}));

export default function NewTraditionScreen() {
  const today = useToday();
  const { household } = useActiveHousehold();
  const create = useCreateTradition(household?.id ?? "");

  const [festivalType, setFestivalType] = useState<string>("DIWALI");
  const [category, setCategory] = useState<string>("RITUAL");
  const [scope, setScope] = useState<string>("family");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startedYear, setStartedYear] = useState("");
  const [region, setRegion] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const year = startedYear.trim() ? Number(startedYear) : undefined;
    if (!name.trim()) return setError("Give the tradition a name.");
    if (year !== undefined && (!Number.isInteger(year) || year < 1 || year > Number(today.slice(0, 4)))) {
      return setError("Enter a valid year, like 1998.");
    }
    setError(null);
    create.mutate(
      {
        festival_type: festivalType,
        name: name.trim(),
        category,
        scope,
        description: description.trim() || undefined,
        started_year: year,
        region: region.trim() || undefined,
      },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <Screen>
      <Field label="What's the tradition?" value={name} onChangeText={setName} placeholder="Lighting the first diya" autoCapitalize="sentences" />
      <FieldGroup label="Which festival?">
        <FestivalPicker value={festivalType} onChange={setFestivalType} />
      </FieldGroup>
      <FieldGroup label="What kind?">
        <ChipSelect options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
      </FieldGroup>
      <FieldGroup label="Who keeps it?">
        <ChipSelect options={SCOPES} value={scope} onChange={setScope} />
      </FieldGroup>
      <Field
        label="Tell its story (optional)"
        value={description}
        onChangeText={setDescription}
        placeholder="Dadaji lights the first diya at 7:30 PM, before the house is decorated."
        multiline
      />
      <Field label="Since which year? (optional)" value={startedYear} onChangeText={setStartedYear} keyboardType="number-pad" maxLength={4} placeholder="1998" />
      <Field label="Region or community (optional)" value={region} onChangeText={setRegion} placeholder="Karnataka" />
      {error || create.error ? (
        <AppText variant="label" color={colors.danger} accessibilityLiveRegion="polite">
          {error ?? create.error?.message}
        </AppText>
      ) : null}
      <Button label="Save tradition" loading={create.isPending} onPress={submit} />
    </Screen>
  );
}
