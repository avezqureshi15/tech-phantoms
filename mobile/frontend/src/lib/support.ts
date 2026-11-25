import { z } from "zod";

/** What a call back can be about. The same closed list the server accepts. */
export const TOPICS = [
  { value: "expense_dispute", label: "An expense" },
  { value: "group_help", label: "A group" },
  { value: "account_access", label: "Getting in" },
  { value: "app_problem", label: "A problem" },
  { value: "other", label: "Something else" },
] as const;
export type Topic = (typeof TOPICS)[number]["value"];

/** The languages a person can ask to be called in (the server accepts exactly these). */
export const CALL_LANGUAGES = [
  { value: "en-IN", label: "English" },
  { value: "hi-IN", label: "Hindi" },
  { value: "kn-IN", label: "Kannada" },
  { value: "ta-IN", label: "Tamil" },
  { value: "te-IN", label: "Telugu" },
  { value: "ml-IN", label: "Malayalam" },
  { value: "mr-IN", label: "Marathi" },
  { value: "bn-IN", label: "Bengali" },
  { value: "gu-IN", label: "Gujarati" },
  { value: "pa-IN", label: "Punjabi" },
  { value: "od-IN", label: "Odia" },
] as const;
export type CallLanguage = (typeof CALL_LANGUAGES)[number]["value"];

export const MAX_NOTE = 300;

/** What the person agrees to, word for word. If this changes, the server's consent version changes too. */
export const CONSENT_TEXT =
  "I agree that the FestiveOS support team may phone me on this number about this request. My name, number, language and note are shared with them for that.";

/** Spaces, dashes and brackets people type are harmless; the rest must be international format. */
export function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s().-]/g, "");
  return /^\+[1-9][0-9]{7,14}$/.test(cleaned) ? cleaned : null;
}

/** Lets someone start with "98765 43210" (an Indian mobile) by adding +91, and nothing else. */
export function withCountryCode(raw: string, defaultCode = "+91"): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/[\s().-]/g, "");
  return /^[0-9]{10}$/.test(digits) ? `${defaultCode}${digits}` : trimmed;
}

export const callbackResultSchema = z.object({
  id: z.string(),
  status: z.enum(["sent", "do_not_call"]),
  created_at: z.string(),
});
export type CallbackResult = z.infer<typeof callbackResultSchema>;

export type CallbackForm = {
  phone: string;
  language: CallLanguage;
  topic: Topic;
  note: string;
  consent: boolean;
};

/** The first thing wrong with the form, in words a person can act on, or null when it can be sent. */
export function problemWith(form: CallbackForm): string | null {
  if (!normalizePhone(withCountryCode(form.phone))) {
    return "Enter your number with its country code, like +91 98765 43210.";
  }
  if (form.note.length > MAX_NOTE) return `Please keep the note under ${MAX_NOTE} characters.`;
  if (!form.consent) return "Please tick the box to say we may call you.";
  return null;
}

export function toRequest(form: CallbackForm) {
  return {
    phone: normalizePhone(withCountryCode(form.phone)),
    language: form.language,
    topic: form.topic,
    note: form.note.trim() || undefined,
    consent: true as const,
  };
}
