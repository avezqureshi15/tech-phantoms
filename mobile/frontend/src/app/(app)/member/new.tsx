import { router } from "expo-router";
import { useState } from "react";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { ChipSelect } from "@/components/Chip";
import { Field, FieldGroup } from "@/components/Field";
import { Screen } from "@/components/Screen";
import { useActiveHousehold, useAddMember } from "@/features/queries";
import { RELATIONSHIPS, titleCase } from "@/lib/meta";
import { colors } from "@/lib/theme";

const OPTIONS = RELATIONSHIPS.map((value) => ({ value, label: titleCase(value) }));
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function NewMemberScreen() {
  const { household } = useActiveHousehold();
  const addMember = useAddMember(household?.id ?? "");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!EMAIL_PATTERN.test(email.trim())) return setError("Enter a valid email address.");
    setError(null);
    addMember.mutate(
      { email: email.trim(), relationship: relationship ?? undefined },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <Screen>
      <AppText color={colors.muted}>
        They need to have signed in to FestiveOS with Google once. Ask them to install the app and
        sign in, then add them here with the same Google email.
      </AppText>
      <Field
        label="Their Google email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="mom@gmail.com"
      />
      <FieldGroup label="Who are they to you? (optional)">
        <ChipSelect options={OPTIONS} value={relationship} onChange={setRelationship} />
      </FieldGroup>
      {error || addMember.error ? (
        <AppText variant="label" color={colors.danger} accessibilityLiveRegion="polite">
          {error ?? addMember.error?.message}
        </AppText>
      ) : null}
      <Button label="Add to family" loading={addMember.isPending} onPress={submit} />
    </Screen>
  );
}
