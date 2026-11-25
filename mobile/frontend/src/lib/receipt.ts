import { z } from "zod";

import { parseDate } from "@/lib/dates";

/** What the server read off a receipt. A draft: nothing is saved until the person confirms. */
export const receiptDraftSchema = z.object({
  merchant: z.string().nullable(),
  spent_on: z.string().nullable(),
  total_minor: z.number().nullable(),
  currency: z.string(),
  items: z.array(z.object({ name: z.string(), amount_minor: z.number() })),
  warnings: z.array(z.string()),
});
export type ReceiptDraft = z.infer<typeof receiptDraftSchema>;

/** Paise as the text a person would type into an amount box: 132300 becomes "1323.00". */
export const minorToInput = (minor: number): string => (minor / 100).toFixed(2);

export type ExpenseFill = {
  description?: string;
  amount?: string;
  date?: Date;
  /** What to double-check, in plain words. */
  notes: string[];
};

/** The form fields a draft can fill. Only what was actually read is filled; the rest is left to the person. */
export function fillFromReceipt(draft: ReceiptDraft): ExpenseFill {
  const notes = [...draft.warnings];
  if (draft.items.length > 0 && !draft.merchant) notes.push("Check what it was for.");
  const fill: ExpenseFill = { notes };
  if (draft.merchant) fill.description = draft.merchant;
  else if (draft.items.length === 1) fill.description = draft.items[0]!.name;
  if (draft.total_minor !== null) fill.amount = minorToInput(draft.total_minor);
  if (draft.spent_on) fill.date = parseDate(draft.spent_on);
  return fill;
}

export const RECEIPT_TYPES = ["application/pdf", "image/*"];
