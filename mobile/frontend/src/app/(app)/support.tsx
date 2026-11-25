import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/States";
import { Field, FieldGroup } from "@/components/Field";
import { Screen } from "@/components/Screen";
import { useFeatures, useRequestCallback } from "@/features/queries";
import {
  CALL_LANGUAGES,
  CONSENT_TEXT,
  MAX_NOTE,
  TOPICS,
  problemWith,
  toRequest,
  type CallLanguage,
  type CallbackResult,
  type Topic,
} from "@/lib/support";
import { colors, MIN_TOUCH, radius, spacing } from "@/lib/theme";

export default function SupportScreen() {
  const features = useFeatures();
  const send = useRequestCallback();
  const [topic, setTopic] = useState<Topic>("other");
  const [language, setLanguage] = useState<CallLanguage>("hi-IN");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CallbackResult | null>(null);

  if (!features.on("support_callback")) {
    return (
      <EmptyState
        icon="pause-circle"
        title="Call-back support is resting"
        message="It is switched off for a little while. Please try again later."
        actionLabel="Go back"
        onAction={() => router.back()}
      />
    );
  }

  if (done) {
    const refused = done.status === "do_not_call";
    return (
      <EmptyState
        icon={refused ? "call" : "checkmark-circle"}
        title={refused ? "We cannot call that number" : "We will call you back"}
        message={
          refused
            ? "That number is on our do-not-call list. Use a different number, or ask in the app instead."
            : "Someone from the support team will phone you, in the language you chose. Keep your phone nearby."
        }
        actionLabel="Done"
        onAction={() => router.back()}
      />
    );
  }

  const form = { phone, language, topic, note, consent };
  const submit = () => {
    const problem = problemWith(form);
    if (problem) return setError(problem);
    setError(null);
    send.mutate(toRequest(form), { onSuccess: setDone, onError: (e) => setError(e.message) });
  };

  return (
    <Screen>
      <AppText color={colors.muted}>
        Tell us what you need help with and we will phone you back. You do not have to type a long message.
      </AppText>

      <FieldGroup label="What is it about?">
        <View style={styles.chips}>
          {TOPICS.map((item) => (
            <Chip
              key={item.value}
              label={item.label}
              selected={topic === item.value}
              onPress={() => setTopic(item.value)}
            />
          ))}
        </View>
      </FieldGroup>

      <FieldGroup label="Call me in">
        <View style={styles.chips}>
          {CALL_LANGUAGES.map((item) => (
            <Chip
              key={item.value}
              label={item.label}
              selected={language === item.value}
              onPress={() => setLanguage(item.value)}
            />
          ))}
        </View>
      </FieldGroup>

      <Field
        label="Your phone number"
        value={phone}
        onChangeText={setPhone}
        placeholder="+91 98765 43210"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
      />
      <Field
        label="Anything we should know? (optional)"
        value={note}
        onChangeText={setNote}
        placeholder="For example: the split on the sweets bill looks wrong"
        multiline
        maxLength={MAX_NOTE}
      />

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent }}
        accessibilityLabel={CONSENT_TEXT}
        onPress={() => setConsent(!consent)}
        style={styles.consent}
      >
        <Ionicons
          name={consent ? "checkbox" : "square-outline"}
          size={28}
          color={consent ? colors.saffronDeep : colors.muted}
        />
        <AppText style={{ flex: 1 }}>{CONSENT_TEXT}</AppText>
      </Pressable>

      {error ? (
        <AppText color={colors.danger} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <Button label="Call me back" loading={send.isPending} onPress={submit} />
      <AppText variant="caption" color={colors.muted}>
        We do not keep your number in the app. It goes to the support team only to make this call.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  consent: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
    minHeight: MIN_TOUCH,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
