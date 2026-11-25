import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { AmountField, DateField, Field, FieldGroup } from "@/components/Field";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import {
  useActiveHousehold,
  useCreateExpense,
  useFestivals,
  useMemberNames,
  useFeatures,
  useScanReceipt,
  type ReceiptFile,
} from "@/features/queries";
import { useCurrentUser } from "@/lib/auth";
import { useToday } from "@/lib/clock-context";
import { parseDate, toApiDate } from "@/lib/dates";
import { EXPENSE_CATEGORIES } from "@/lib/meta";
import { formatMoney, parseMinor, previewEqualShares } from "@/lib/money";
import { PermissionDenied, PickFailed, pickFile, type PickSource } from "@/lib/pick";
import { fillFromReceipt } from "@/lib/receipt";
import { colors, spacing } from "@/lib/theme";

type SplitMode = "equal" | "exact";

export default function NewExpenseScreen() {
  const user = useCurrentUser();
  const today = useToday();
  const params = useLocalSearchParams<{ festival?: string }>();
  const { household } = useActiveHousehold();
  const { members, name } = useMemberNames(household?.id);
  const festivals = useFestivals(household?.id);
  const create = useCreateExpense(household?.id ?? "");
  const features = useFeatures();
  const scan = useScanReceipt(household?.id ?? "");
  const [scanNotes, setScanNotes] = useState<string[] | null>(null);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(user.id);
  const [people, setPeople] = useState<string[] | null>(null); // null = everyone
  const [mode, setMode] = useState<SplitMode>("equal");
  const [exact, setExact] = useState<Record<string, string>>({});
  const [category, setCategory] = useState("food");
  const [festivalId, setFestivalId] = useState<string | null>(params.festival ?? null);
  const [date, setDate] = useState(parseDate(today));
  const [error, setError] = useState<string | null>(null);

  const everyone = members.map((m) => m.user.id);
  const chosen = people ?? everyone;
  const total = parseMinor(amount);
  const currency = household?.currency ?? "INR";
  const shares = total && mode === "equal" ? previewEqualShares(total, chosen.length) : [];
  const exactSum = chosen.reduce((sum, id) => sum + (parseMinor(exact[id] ?? "") ?? 0), 0);

  const readReceipt = (file: ReceiptFile) =>
    scan.mutate(file, {
      onSuccess: (draft) => {
        const fill = fillFromReceipt(draft);
        if (fill.description) setDescription(fill.description);
        if (fill.amount) setAmount(fill.amount);
        if (fill.date) setDate(fill.date);
        setScanNotes(fill.notes);
        setError(null);
      },
      onError: (e) => setError(e.message),
    });

  const pickReceipt = async (source: PickSource) => {
    try {
      const file = await pickFile(source);
      if (file) readReceipt(file);
    } catch (e) {
      if (e instanceof PermissionDenied) Alert.alert("Permission needed", e.message);
      else if (e instanceof PickFailed) Alert.alert("Couldn't open that", e.message);
      else throw e;
    }
  };

  const toggle = (id: string) => setPeople(chosen.includes(id) ? chosen.filter((p) => p !== id) : [...chosen, id]);

  const submit = () => {
    if (!description.trim()) return setError("What was it for?");
    if (!total) return setError("Enter an amount greater than zero, like 250 or 99.50.");
    if (chosen.length === 0) return setError("Choose at least one person to split with.");
    if (mode === "exact" && exactSum !== total) {
      return setError(`The amounts add up to ${formatMoney(exactSum, currency)}, not ${formatMoney(total, currency)}.`);
    }
    setError(null);
    create.mutate(
      {
        description: description.trim(),
        amount_minor: total,
        paid_by: paidBy,
        category,
        spent_on: toApiDate(date),
        festival_id: festivalId,
        split: {
          type: mode,
          entries: chosen.map((id) =>
            mode === "exact" ? { user_id: id, value: parseMinor(exact[id] ?? "") ?? 0 } : { user_id: id },
          ),
        },
      },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <Screen>
      {features.on("receipt_scan") ? (
        <FieldGroup label="Scan a receipt">
          <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
            <Chip label="Camera" icon="camera" onPress={() => void pickReceipt("camera")} />
            <Chip label="Photos" icon="image" onPress={() => void pickReceipt("library")} />
            <Chip label="PDF or file" icon="document" onPress={() => void pickReceipt("file")} />
          </View>
          {scan.isPending ? (
            <AppText variant="caption" color={colors.muted} accessibilityLiveRegion="polite">
              Reading your receipt…
            </AppText>
          ) : null}
          {scanNotes ? (
            <AppText
              variant="caption"
              color={scanNotes.length ? colors.danger : colors.success}
              accessibilityLiveRegion="polite"
            >
              {scanNotes.length ? scanNotes.join(" ") : "Filled in from your receipt. Please check it before saving."}
            </AppText>
          ) : null}
        </FieldGroup>
      ) : null}
      <AmountField currency={currency} value={amount} onChangeText={setAmount} />
      <Field
        label="What was it for?"
        value={description}
        onChangeText={setDescription}
        placeholder="Sweets, decorations, cab…"
        maxLength={120}
      />

      <FieldGroup label="Category">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {EXPENSE_CATEGORIES.map((c) => (
            <Chip
              key={c.value}
              label={c.label}
              icon={c.icon}
              selected={category === c.value}
              onPress={() => setCategory(c.value)}
            />
          ))}
        </View>
      </FieldGroup>

      <FieldGroup label="Paid by">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {members.map((m) => (
            <Chip
              key={m.user.id}
              label={m.user.id === user.id ? "You" : m.user.name}
              selected={paidBy === m.user.id}
              onPress={() => setPaidBy(m.user.id)}
            />
          ))}
        </View>
      </FieldGroup>

      <FieldGroup label="Split">
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: "equal", label: "Equally" },
            { value: "exact", label: "Exact amounts" },
          ]}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {members.map((m) => (
            <Chip
              key={m.user.id}
              label={m.user.id === user.id ? "You" : m.user.name}
              icon={chosen.includes(m.user.id) ? "checkmark" : undefined}
              selected={chosen.includes(m.user.id)}
              onPress={() => toggle(m.user.id)}
            />
          ))}
        </View>
      </FieldGroup>

      {mode === "equal" && total ? (
        <View style={{ gap: 2 }}>
          {chosen.map((id, i) => (
            <AppText key={id} variant="caption" color={colors.muted}>
              {id === user.id ? "You" : name(id)} owes {formatMoney(shares[i] ?? 0, currency)}
            </AppText>
          ))}
        </View>
      ) : null}

      {mode === "exact"
        ? chosen.map((id) => (
            <Field
              key={id}
              label={`${id === user.id ? "You" : name(id)} owes`}
              value={exact[id] ?? ""}
              onChangeText={(v) => setExact({ ...exact, [id]: v })}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
          ))
        : null}

      {festivals.data && festivals.data.length > 0 ? (
        <FieldGroup label="For a festival (optional)">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {festivals.data.map((f) => (
              <Chip
                key={f.id}
                label={f.name}
                selected={festivalId === f.id}
                onPress={() => setFestivalId(festivalId === f.id ? null : f.id)}
              />
            ))}
          </View>
        </FieldGroup>
      ) : null}

      <DateField label="Date" value={date} onChange={setDate} maximumDate={parseDate(today)} />

      {error || create.error ? (
        <AppText variant="label" color={colors.danger} accessibilityLiveRegion="polite">
          {error ?? create.error?.message}
        </AppText>
      ) : null}
      <Button label="Save expense" loading={create.isPending} onPress={submit} />
    </Screen>
  );
}
