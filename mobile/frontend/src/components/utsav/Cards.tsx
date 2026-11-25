import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Chip, ChipSelect } from "@/components/Chip";
import { Field, FieldGroup } from "@/components/Field";
import { SegmentedControl } from "@/components/SegmentedControl";
import { addToPhoneCalendar } from "@/lib/calendar";
import { problems, summarise, toAnswers, type Draft } from "@/lib/utsav/answers";
import { safeUrl } from "@/lib/utsav/markdown";
import type { Card as CardData, QuestionCard, QuestionField } from "@/lib/utsav/schemas";
import { colors, spacing } from "@/lib/theme";

type QuestionProps = {
  card: QuestionCard;
  disabled?: boolean;
  onSubmit: (answers: Record<string, unknown>, summary: string) => void;
};

/** The questions Utsav needs answered, as one form: choices where there are choices, never free text. */
export function QuestionCardView({ card, disabled = false, onSubmit }: QuestionProps) {
  const [draft, setDraft] = useState<Draft>({});
  const [tried, setTried] = useState(false);
  const found = useMemo(() => problems(card, draft), [card, draft]);
  const set = (key: string, value: Draft[string]) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = () => {
    setTried(true);
    if (Object.keys(found).length > 0) return;
    const answers = toAnswers(card, draft);
    onSubmit(answers, summarise(card, answers));
  };

  return (
    <Card style={styles.card}>
      <View style={{ gap: 2 }}>
        <AppText variant="heading">{card.title}</AppText>
        {card.description ? (
          <AppText variant="caption" color={colors.muted}>
            {card.description}
          </AppText>
        ) : null}
      </View>
      {card.fields.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={draft[field.key]}
          error={tried ? (found[field.key] ?? null) : null}
          onChange={(value) => set(field.key, value)}
        />
      ))}
      <Button label="Send answers" icon="send" onPress={submit} disabled={disabled} />
    </Card>
  );
}

function FieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: QuestionField;
  value: Draft[string];
  error: string | null;
  onChange: (value: Draft[string]) => void;
}) {
  const label = field.required ? field.label : `${field.label} (optional)`;
  const hint = error ? (
    <AppText variant="caption" color={colors.danger}>
      {error}
    </AppText>
  ) : null;

  switch (field.type) {
    case "single_choice":
      return (
        <FieldGroup label={label}>
          <ChipSelect
            options={field.options}
            value={typeof value === "string" ? value : null}
            onChange={onChange}
          />
          {hint}
        </FieldGroup>
      );
    case "multi_choice": {
      const chosen = Array.isArray(value) ? value : [];
      return (
        <FieldGroup label={label}>
          <View style={styles.chips}>
            {field.options.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={chosen.includes(option.value)}
                onPress={() =>
                  onChange(
                    chosen.includes(option.value)
                      ? chosen.filter((v) => v !== option.value)
                      : [...chosen, option.value],
                  )
                }
              />
            ))}
          </View>
          {hint}
        </FieldGroup>
      );
    }
    case "yes_no":
      return (
        <FieldGroup label={label}>
          <SegmentedControl
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            value={value === true ? "yes" : value === false ? "no" : ("" as "yes")}
            onChange={(v) => onChange(v === "yes")}
          />
          {hint}
        </FieldGroup>
      );
    case "number":
      return (
        <Field
          label={`${label}${field.unit ? ` (${field.unit})` : ""}`}
          value={typeof value === "string" ? value : ""}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder={field.minimum != null && field.maximum != null ? `${field.minimum} to ${field.maximum}` : undefined}
          error={error}
        />
      );
    case "text":
      return (
        <Field
          label={label}
          value={typeof value === "string" ? value : ""}
          onChangeText={onChange}
          maxLength={300}
          error={error}
        />
      );
  }
}

type ConfirmProps = {
  card: Extract<CardData, { kind: "confirm" }>;
  disabled?: boolean;
  onDecide: (decision: "approve" | "decline") => void;
};

/** A change Utsav wants to make. Nothing happens until it is approved here. */
export function ConfirmCardView({ card, disabled = false, onDecide }: ConfirmProps) {
  return (
    <Card style={styles.card}>
      <View style={{ gap: 2 }}>
        <AppText variant="heading">{card.title}</AppText>
        <AppText color={colors.muted}>{card.summary}</AppText>
      </View>
      <View style={styles.details}>
        {card.details.map((detail) => (
          <View key={detail.label} style={styles.detailRow}>
            <AppText variant="label" color={colors.muted} style={styles.detailLabel}>
              {detail.label}
            </AppText>
            <AppText style={{ flex: 1 }}>{detail.value}</AppText>
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        <Button label="Approve" icon="checkmark" onPress={() => onDecide("approve")} disabled={disabled} style={{ flex: 1 }} />
        <Button label="Not now" variant="secondary" onPress={() => onDecide("decline")} disabled={disabled} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

/** The result of the hosting calculator, exactly as computed. */
export function HostingPlanView({ card }: { card: Extract<CardData, { kind: "hosting_plan" }> }) {
  return (
    <Card style={styles.card}>
      <View style={{ gap: 2 }}>
        <AppText variant="heading">{card.title}</AppText>
        <AppText color={colors.saffronDeep} variant="label">
          {card.headline}
        </AppText>
      </View>
      {card.sections.map((section) => (
        <View key={section.heading} style={{ gap: spacing.xs }}>
          <AppText variant="eyebrow" color={colors.muted}>
            {section.heading}
          </AppText>
          {section.lines.map((line, index) => (
            <View key={`${line.label}:${index}`} style={styles.detailRow}>
              <AppText style={{ flex: 1 }}>{line.label}</AppText>
              <AppText variant="label">{line.value}</AppText>
            </View>
          ))}
        </View>
      ))}
    </Card>
  );
}

type LinksCardData = Extract<CardData, { kind: "links" }>;

/** Pages to open, such as event listings to RSVP on. Only ordinary web links open. */
export function LinksCardView({ card }: { card: LinksCardData }) {
  return (
    <Card style={styles.card}>
      <View style={{ gap: 2 }}>
        <AppText variant="heading">{card.title}</AppText>
        {card.description ? (
          <AppText variant="caption" color={colors.muted}>
            {card.description}
          </AppText>
        ) : null}
      </View>
      {card.links.map((link, index) => {
        const url = safeUrl(link.url);
        return (
          <Pressable
            key={`${link.url}:${index}`}
            accessibilityRole="link"
            accessibilityLabel={link.note ? `${link.label}, ${link.note}` : link.label}
            disabled={!url}
            onPress={() => url && void Linking.openURL(url).catch(() => undefined)}
            style={styles.linkRow}
          >
            <View style={{ flex: 1, gap: 1 }}>
              <AppText variant="label" numberOfLines={2}>
                {link.label}
              </AppText>
              {link.note ? (
                <AppText variant="caption" color={colors.muted} numberOfLines={2}>
                  {link.note}
                </AppText>
              ) : null}
            </View>
            <Ionicons name="open-outline" size={18} color={colors.saffronDeep} />
          </Pressable>
        );
      })}
    </Card>
  );
}

type CalendarCardData = Extract<CardData, { kind: "calendar_event" }>;

/** An event Utsav suggests for the person's phone calendar. Nothing is added until they tap. */
export function CalendarCardView({ card }: { card: CalendarCardData }) {
  const [state, setState] = useState<"idle" | "adding" | "added" | "denied" | "failed">("idle");
  const same = card.start_date === card.end_date;

  const add = async () => {
    setState("adding");
    try {
      const result = await addToPhoneCalendar({
        title: card.title,
        startDate: card.start_date,
        endDate: card.end_date,
        notes: card.notes,
      });
      setState(result === "added" ? "added" : result === "denied" ? "denied" : "failed");
    } catch {
      setState("failed");
    }
  };

  return (
    <Card style={styles.card}>
      <View style={{ gap: 2 }}>
        <AppText variant="heading">{card.title}</AppText>
        <AppText color={colors.muted}>{same ? card.start_date : `${card.start_date} to ${card.end_date}`}</AppText>
        {card.notes ? (
          <AppText variant="caption" color={colors.muted}>
            {card.notes}
          </AppText>
        ) : null}
      </View>
      <Button
        label={state === "added" ? "Added to your calendar" : "Add to my calendar"}
        icon={state === "added" ? "checkmark" : "calendar"}
        onPress={() => void add()}
        disabled={state === "added"}
        loading={state === "adding"}
      />
      {state === "denied" ? (
        <AppText variant="caption" color={colors.danger} accessibilityRole="alert">
          Allow calendar access in Settings to add this.
        </AppText>
      ) : null}
      {state === "failed" ? (
        <AppText variant="caption" color={colors.danger} accessibilityRole="alert">
          Couldn&apos;t add it. Check that you have a calendar set up on this phone.
        </AppText>
      ) : null}
    </Card>
  );
}

/**
 * A card inside the transcript. A result card shows in full. A question or confirmation that is
 * already answered shrinks to one line (the live one, still waiting, is the form at the bottom of the
 * screen, so it is skipped here to avoid showing it twice).
 */
export function CardView({ card, pendingId }: { card: CardData; pendingId?: string | null }) {
  if (card.kind === "hosting_plan") return <HostingPlanView card={card} />;
  if (card.kind === "links") return <LinksCardView card={card} />;
  if (card.kind === "calendar_event") return <CalendarCardView card={card} />;
  if (card.id === pendingId) return null;
  return (
    <AppText variant="caption" color={colors.muted} style={styles.asked}>
      {card.kind === "question" ? "Utsav asked: " : "Utsav suggested: "}
      {card.title}
    </AppText>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  details: { gap: spacing.sm },
  detailRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", justifyContent: "space-between" },
  detailLabel: { width: 96 },
  actions: { flexDirection: "row", gap: spacing.md },
  asked: { paddingHorizontal: spacing.xs },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 48,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
});
