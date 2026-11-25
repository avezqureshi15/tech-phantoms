import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import { AppText } from "@/components/AppText";
import { formatDate, formatTime, toApiDate, toApiTime } from "@/lib/dates";
import { colors, fonts, radius, spacing } from "@/lib/theme";

type FieldProps = Omit<TextInputProps, "style"> & {
  label: string;
  error?: string | null;
};

export function Field({ label, error, multiline, ...input }: FieldProps) {
  return (
    <View style={styles.group}>
      <AppText variant="label" color={colors.muted}>
        {label}
      </AppText>
      <TextInput
        {...input}
        multiline={multiline}
        accessibilityLabel={label}
        placeholderTextColor="#B5A79C"
        style={[
          styles.input,
          multiline && { minHeight: 96, textAlignVertical: "top", paddingTop: 14 },
          !!error && { borderColor: colors.danger },
        ]}
      />
      {error ? (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

export function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <AppText variant="label" color={colors.muted}>
        {label}
      </AppText>
      {children}
    </View>
  );
}

type DateFieldProps = {
  label: string;
  value: Date;
  onChange: (value: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
};

export function DateField({ label, value, onChange, minimumDate, maximumDate }: DateFieldProps) {
  const [open, setOpen] = useState(false);

  const pick = (selected: Date) => {
    setOpen(false);
    onChange(selected);
  };

  return (
    <FieldGroup label={label}>
      {Platform.OS === "ios" ? (
        <View style={styles.iosPicker}>
          <DateTimePicker
            value={value}
            mode="date"
            display="compact"
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            accentColor={colors.saffron}
            onValueChange={(_, selected) => onChange(selected)}
          />
        </View>
      ) : (
        <>
          <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.input}>
            <AppText>{formatDate(toApiDate(value))}</AppText>
          </Pressable>
          {open ? (
            <DateTimePicker
              value={value}
              mode="date"
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              onValueChange={(_, selected) => pick(selected)}
              onDismiss={() => setOpen(false)}
            />
          ) : null}
        </>
      )}
    </FieldGroup>
  );
}

type TimeFieldProps = {
  label: string;
  value: Date | null;
  onChange: (value: Date | null) => void;
};

export function TimeField({ label, value, onChange }: TimeFieldProps) {
  const [open, setOpen] = useState(false);
  const display = value ? formatTime(toApiTime(value)) : "Not set";

  const pick = (selected: Date) => {
    setOpen(false);
    onChange(selected);
  };

  return (
    <FieldGroup label={label}>
      <View style={styles.timeRow}>
        {Platform.OS === "ios" && value ? (
          <View style={styles.iosPicker}>
            <DateTimePicker
              value={value}
              mode="time"
              display="compact"
              accentColor={colors.saffron}
              onValueChange={(_, selected) => onChange(selected)}
            />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => (Platform.OS === "ios" ? onChange(new Date()) : setOpen(true))}
            style={[styles.input, { flex: 1 }]}
          >
            <AppText color={value ? colors.ink : "#B5A79C"}>{display}</AppText>
          </Pressable>
        )}
        {value ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label}`} onPress={() => onChange(null)}>
            <AppText variant="label" color={colors.saffronDeep}>
              Clear
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {open ? (
        <DateTimePicker
          value={value ?? new Date()}
          mode="time"
          onValueChange={(_, selected) => pick(selected)}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </FieldGroup>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.ink,
    minHeight: 50,
    justifyContent: "center",
  },
  iosPicker: { alignItems: "flex-start" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
