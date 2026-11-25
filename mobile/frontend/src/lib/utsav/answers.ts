import type { QuestionCard, QuestionField } from "@/lib/utsav/schemas";

/** What the person has entered so far. Numbers stay as text until submit, so "1." can be typed. */
export type Draft = Record<string, string | boolean | string[] | undefined>;

const isBlank = (value: Draft[string]) =>
  value === undefined ||
  (typeof value === "string" && value.trim() === "") ||
  (Array.isArray(value) && value.length === 0);

/** Problems with the entered answers, by field key. The server checks again; this is for speed. */
export function problems(card: QuestionCard, draft: Draft): Record<string, string> {
  const found: Record<string, string> = {};
  for (const field of card.fields) {
    const value = draft[field.key];
    if (isBlank(value)) {
      if (field.required) found[field.key] = "Please answer this";
      continue;
    }
    if (field.type === "number") {
      const number = Number(value);
      if (typeof value !== "string" || value.trim() === "" || !Number.isFinite(number)) {
        found[field.key] = "Enter a number";
      } else if (field.minimum != null && field.maximum != null && (number < field.minimum || number > field.maximum)) {
        found[field.key] = `Enter ${field.minimum} to ${field.maximum}`;
      }
    }
    if (field.type === "text" && typeof value === "string" && value.length > 300) {
      found[field.key] = "Keep it under 300 characters";
    }
  }
  return found;
}

/** The answers in the shape the API expects: numbers as numbers, blank optional fields left out. */
export function toAnswers(card: QuestionCard, draft: Draft): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const field of card.fields) {
    const value = draft[field.key];
    if (isBlank(value)) continue;
    answers[field.key] = field.type === "number" ? Number(value) : typeof value === "string" ? value.trim() : value;
  }
  return answers;
}

const labelOf = (field: QuestionField, value: unknown): string => {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const options = new Map(field.options.map((o) => [o.value, o.label]));
  if (Array.isArray(value)) return value.map((v) => options.get(String(v)) ?? String(v)).join(", ");
  return options.get(String(value)) ?? String(value);
};

/** A one-line recap of what was answered, shown in the chat as the person's own message. */
export function summarise(card: QuestionCard, answers: Record<string, unknown>): string {
  return card.fields
    .filter((field) => field.key in answers)
    .map((field) => `${field.label}: ${labelOf(field, answers[field.key])}${field.unit ? ` ${field.unit}` : ""}`)
    .join("\n");
}
