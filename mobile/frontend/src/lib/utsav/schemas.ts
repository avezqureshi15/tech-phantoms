import { z } from "zod";

/** What Utsav's API sends. Validated at the boundary so a drifting backend fails loudly, here. */
const optionSchema = z.object({ value: z.string(), label: z.string() });

export const fieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["single_choice", "multi_choice", "number", "text", "yes_no"]),
  options: z.array(optionSchema).default([]),
  minimum: z.number().nullable().optional(),
  maximum: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  required: z.boolean().default(true),
});

const detailSchema = z.object({ label: z.string(), value: z.string() });

export const cardSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("question"),
    id: z.string(),
    title: z.string(),
    description: z.string().nullable().optional(),
    fields: z.array(fieldSchema),
  }),
  z.object({
    kind: z.literal("confirm"),
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    details: z.array(detailSchema),
  }),
  z.object({
    kind: z.literal("hosting_plan"),
    id: z.string(),
    title: z.string(),
    headline: z.string(),
    sections: z.array(z.object({ heading: z.string(), lines: z.array(detailSchema) })),
  }),
  z.object({
    kind: z.literal("links"),
    id: z.string(),
    title: z.string(),
    description: z.string().nullable().optional(),
    links: z.array(z.object({ label: z.string(), url: z.string(), note: z.string().nullable().optional() })),
  }),
  z.object({
    kind: z.literal("calendar_event"),
    id: z.string(),
    title: z.string(),
    start_date: z.string(),
    end_date: z.string(),
    notes: z.string().nullable().optional(),
  }),
]);
export type Card = z.infer<typeof cardSchema>;
export type QuestionCard = Extract<Card, { kind: "question" }>;
export type QuestionField = z.infer<typeof fieldSchema>;

export const itemSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("card"), card: cardSchema }),
]);
export type Item = z.infer<typeof itemSchema>;

export const turnSchema = z.object({
  conversation_id: z.string(),
  agent: z.string(),
  items: z.array(itemSchema),
  pending_card: cardSchema.nullable(),
});
export type Turn = z.infer<typeof turnSchema>;

export const conversationSchema = z.object({
  id: z.string(),
  household_id: z.string(),
  title: z.string(),
  active_agent: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const conversationDetailSchema = conversationSchema.extend({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "notice"]),
      items: z.array(itemSchema),
      created_at: z.string(),
    }),
  ),
  pending_card: cardSchema.nullable(),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

/** The events of a streamed turn, after parsing. */
export const streamEventSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("start"), data: z.object({ conversation_id: z.string() }) }),
  z.object({ name: z.literal("text"), data: z.object({ segment: z.number(), text: z.string() }) }),
  z.object({ name: z.literal("tool"), data: z.object({ name: z.string() }) }),
  // The server is retrying one piece of the answer: forget the text of that segment.
  z.object({ name: z.literal("reset"), data: z.object({ segment: z.number() }) }),
  z.object({ name: z.literal("card"), data: z.object({ card: cardSchema }) }),
  z.object({ name: z.literal("pending_card"), data: z.object({ card: cardSchema }) }),
  z.object({ name: z.literal("done"), data: turnSchema }),
  z.object({ name: z.literal("error"), data: z.object({ status: z.number(), message: z.string() }) }),
]);
export type StreamEvent = z.infer<typeof streamEventSchema>;

/** A document read into text, ready to attach to a message. */
export const attachedDocumentSchema = z.object({
  name: z.string(),
  text: z.string(),
  truncated: z.boolean().default(false),
});
export type AttachedDocument = z.infer<typeof attachedDocumentSchema>;
export const MAX_DOCUMENTS = 3;

/** What was said, in whatever language it was said in. */
export const transcriptSchema = z.object({ text: z.string(), language: z.string().nullable().optional() });
