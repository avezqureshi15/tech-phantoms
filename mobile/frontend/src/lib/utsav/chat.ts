import type { Card, ConversationDetail, Item, StreamEvent } from "@/lib/utsav/schemas";

/**
 * The state of one chat, as a pure reducer so every transition can be tested without a screen.
 *
 * A turn streams: text arrives in pieces (grouped into segments, one per model call), tools and
 * cards are announced as they happen, and a final `done` carries the authoritative result. The
 * draft is only a preview: `done` replaces it entirely, so a missed or reordered event can never
 * leave the transcript wrong.
 */
export type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; items: Item[] }
  | { id: string; role: "notice"; text: string };

export type Draft = { segments: Record<number, string>; cards: Card[]; tool: string | null };

export type ChatState = {
  conversationId: string | null;
  messages: Message[];
  pendingCard: Card | null;
  /** The reply being written right now, or null when idle. */
  draft: Draft | null;
  error: string | null;
};

export const initialChat: ChatState = {
  conversationId: null,
  messages: [],
  pendingCard: null,
  draft: null,
  error: null,
};

export type ChatAction =
  | { type: "sent"; id: string; text: string }
  | { type: "event"; event: StreamEvent; id: string }
  | { type: "answered"; id: string; summary: string }
  | { type: "failed"; message: string }
  | { type: "loaded"; detail: ConversationDetail }
  | { type: "reset" };

const emptyDraft: Draft = { segments: {}, cards: [], tool: null };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "reset":
      return initialChat;
    case "sent":
      return {
        ...state,
        messages: [...state.messages, { id: action.id, role: "user", text: action.text }],
        draft: emptyDraft,
        error: null,
      };
    case "answered":
      // The card is closed at once so it cannot be answered twice; the recap becomes the person's message.
      return {
        ...state,
        pendingCard: null,
        messages: action.summary
          ? [...state.messages, { id: action.id, role: "user", text: action.summary }]
          : state.messages,
        draft: emptyDraft,
        error: null,
      };
    case "failed":
      return { ...state, draft: null, error: action.message };
    case "loaded":
      return {
        conversationId: action.detail.id,
        messages: action.detail.messages.map((m, i): Message => {
          const id = `${action.detail.id}:${i}`;
          if (m.role === "assistant") return { id, role: "assistant", items: m.items };
          const text = m.items.flatMap((item) => (item.type === "text" ? [item.text] : [])).join("\n");
          return m.role === "user" ? { id, role: "user", text } : { id, role: "notice", text };
        }),
        pendingCard: action.detail.pending_card,
        draft: null,
        error: null,
      };
    case "event":
      return applyEvent(state, action.event, action.id);
  }
}

function applyEvent(state: ChatState, event: StreamEvent, id: string): ChatState {
  const draft = state.draft ?? emptyDraft;
  switch (event.name) {
    case "start":
      return { ...state, conversationId: event.data.conversation_id };
    case "text":
      return {
        ...state,
        draft: {
          ...draft,
          tool: null,
          segments: {
            ...draft.segments,
            [event.data.segment]: (draft.segments[event.data.segment] ?? "") + event.data.text,
          },
        },
      };
    case "tool":
      return { ...state, draft: { ...draft, tool: event.data.name } };
    case "reset": {
      const { [event.data.segment]: _dropped, ...rest } = draft.segments;
      return { ...state, draft: { ...draft, segments: rest } };
    }
    case "card":
      return { ...state, draft: { ...draft, cards: [...draft.cards, event.data.card] } };
    case "pending_card":
      return { ...state, pendingCard: event.data.card };
    case "done": {
      const items = event.data.items;
      return {
        ...state,
        conversationId: event.data.conversation_id,
        messages: items.length > 0 ? [...state.messages, { id, role: "assistant", items }] : state.messages,
        pendingCard: event.data.pending_card,
        draft: null,
        error: null,
      };
    }
    case "error":
      return { ...state, draft: null, error: event.data.message };
  }
}

/** The draft's text so far, in the order the model wrote it. */
export function draftText(draft: Draft): string {
  return Object.keys(draft.segments)
    .map(Number)
    .sort((a, b) => a - b)
    .map((segment) => draft.segments[segment]!.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Friendly wording for what Utsav is doing while a tool runs. */
const TOOL_STATUS: Record<string, string> = {
  get_household_context: "Looking at your group",
  list_inventory: "Checking what you have at home",
  list_festivals: "Checking your festivals",
  calculate_hosting: "Working out the numbers",
  jugaad_options: "Thinking up clever workarounds",
  ask_user: "Preparing a few questions",
  propose_action: "Preparing something for you to approve",
  handoff: "Thinking",
};

export const toolStatus = (name: string | null): string =>
  name === null ? "Thinking" : (TOOL_STATUS[name] ?? "Working on it");
