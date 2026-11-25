import { problems, summarise, toAnswers } from "@/lib/utsav/answers";
import { chatReducer, draftText, initialChat, toolStatus, type ChatAction, type ChatState } from "@/lib/utsav/chat";
import { closeOpenFences, safeUrl } from "@/lib/utsav/markdown";
import type { QuestionCard, StreamEvent } from "@/lib/utsav/schemas";
import { SseParser } from "@/lib/utsav/sse";

describe("SseParser", () => {
  it("returns an event only once it is complete, across chunk boundaries", () => {
    const parser = new SseParser();
    expect(parser.push("event: text\ndata: {\"a\"")).toEqual([]);
    expect(parser.push(":1}\n")).toEqual([]);
    expect(parser.push("\n")).toEqual([{ name: "text", data: '{"a":1}' }]);
  });

  it("handles several events in one chunk, CRLF line ends and keep-alive comments", () => {
    const parser = new SseParser();
    const events = parser.push(": ping\r\nevent: a\r\ndata: 1\r\n\r\nevent: b\r\ndata: 2\r\n\r\n");
    expect(events).toEqual([
      { name: "a", data: "1" },
      { name: "b", data: "2" },
    ]);
  });

  it("joins multi-line data and does not split a UTF-8 line that arrives in pieces", () => {
    const parser = new SseParser();
    expect(parser.push("data: नमस्")).toEqual([]);
    expect(parser.push("ते\ndata: दुनिया\n\n")).toEqual([{ name: "message", data: "नमस्ते\nदुनिया" }]);
  });
});

const turn = (items: object[] = [], pending: object | null = null): StreamEvent =>
  ({
    name: "done",
    data: { conversation_id: "c1", agent: "sutradhar", items, pending_card: pending },
  }) as StreamEvent;

const text = (segment: number, piece: string): StreamEvent => ({ name: "text", data: { segment, text: piece } });

const apply = (actions: ChatAction[], from: ChatState = initialChat) => actions.reduce(chatReducer, from);
const event = (e: StreamEvent): ChatAction => ({ type: "event", event: e, id: "reply" });

describe("chatReducer", () => {
  it("builds the draft from text pieces, one paragraph per model call", () => {
    const state = apply([
      { type: "sent", id: "u1", text: "hi" },
      event(text(1, "Let me ")),
      event(text(1, "check.")),
      event({ name: "tool", data: { name: "list_inventory" } }),
      event(text(2, "All good.")),
    ]);

    expect(draftText(state.draft!)).toBe("Let me check.\n\nAll good.");
    expect(state.messages).toEqual([{ id: "u1", role: "user", text: "hi" }]);
  });

  it("forgets a cut-off piece when the server retries it, and keeps the rest", () => {
    const state = apply([
      { type: "sent", id: "u", text: "recite" },
      event(text(1, "Jai Hanuman gyan gun sa")),
      event({ name: "reset", data: { segment: 1 } }),
      event(text(2, "The first verse, with its meaning.")),
    ]);

    expect(draftText(state.draft!)).toBe("The first verse, with its meaning.");
  });

  it("shows what Utsav is doing while a tool runs, and clears it when words resume", () => {
    const tooling = apply([{ type: "sent", id: "u", text: "hi" }, event({ name: "tool", data: { name: "list_inventory" } })]);
    expect(toolStatus(tooling.draft!.tool)).toBe("Checking what you have at home");

    const talking = apply([event(text(1, "Done"))], tooling);
    expect(talking.draft!.tool).toBeNull();
    expect(toolStatus("something_new")).toBe("Working on it");
  });

  it("replaces the whole draft with the authoritative result on done", () => {
    const state = apply([
      { type: "sent", id: "u", text: "hi" },
      event(text(1, "a half-")),
      event(turn([{ type: "text", text: "The real answer" }])),
    ]);

    expect(state.draft).toBeNull();
    expect(state.messages.at(-1)).toEqual({
      id: "reply",
      role: "assistant",
      items: [{ type: "text", text: "The real answer" }],
    });
    expect(state.conversationId).toBe("c1");
  });

  it("keeps a pending card and clears it the moment it is answered", () => {
    const card = { kind: "confirm", id: "k", title: "t", summary: "s", details: [] };
    const waiting = apply([{ type: "sent", id: "u", text: "x" }, event(turn([], card))]);
    expect(waiting.pendingCard).toEqual(card);
    expect(waiting.messages).toHaveLength(1); // no empty assistant bubble for a turn with no items

    const answered = apply([{ type: "answered", id: "a", summary: "Approved" }], waiting);
    expect(answered.pendingCard).toBeNull();
    expect(answered.draft).not.toBeNull();
    expect(answered.messages.at(-1)).toEqual({ id: "a", role: "user", text: "Approved" });
  });

  it("turns a stream error into a message and stops the draft", () => {
    const state = apply([
      { type: "sent", id: "u", text: "hi" },
      event(text(1, "partial")),
      event({ name: "error", data: { status: 503, message: "Utsav is unavailable right now." } }),
    ]);

    expect(state.draft).toBeNull();
    expect(state.error).toBe("Utsav is unavailable right now.");
  });

  it("opens a saved conversation as messages and its waiting card", () => {
    const state = apply([
      {
        type: "loaded",
        detail: {
          id: "c9",
          household_id: "h",
          title: "t",
          active_agent: "x",
          created_at: "",
          updated_at: "",
          pending_card: null,
          messages: [
            { role: "user", items: [{ type: "text", text: "hello" }], created_at: "" },
            { role: "assistant", items: [{ type: "text", text: "namaste" }], created_at: "" },
            { role: "notice", items: [{ type: "text", text: "cut short" }], created_at: "" },
          ],
        },
      },
    ]);

    expect(state.conversationId).toBe("c9");
    expect(state.messages.map((m) => m.role)).toEqual(["user", "assistant", "notice"]);
    expect(state.messages[0]).toMatchObject({ text: "hello" });
  });
});

const card: QuestionCard = {
  kind: "question",
  id: "q",
  title: "Details",
  fields: [
    { key: "adults", label: "Adults", type: "number", options: [], minimum: 1, maximum: 50, required: true },
    {
      key: "diet",
      label: "Diet",
      type: "single_choice",
      options: [
        { value: "veg", label: "Vegetarian" },
        { value: "mixed", label: "Mixed" },
      ],
      required: true,
    },
    { key: "note", label: "Note", type: "text", options: [], required: false },
    { key: "pets", label: "Pets", type: "yes_no", options: [], required: false },
  ],
};

describe("question answers", () => {
  it("asks for every required field and nothing else", () => {
    expect(Object.keys(problems(card, {}))).toEqual(["adults", "diet"]);
  });

  it("checks number ranges and rejects text that is not a number", () => {
    expect(problems(card, { adults: "0", diet: "veg" }).adults).toBe("Enter 1 to 50");
    expect(problems(card, { adults: "51", diet: "veg" }).adults).toBe("Enter 1 to 50");
    expect(problems(card, { adults: "abc", diet: "veg" }).adults).toBe("Enter a number");
    expect(problems(card, { adults: "3", diet: "veg" })).toEqual({});
  });

  it("sends numbers as numbers and leaves blank optional fields out", () => {
    expect(toAnswers(card, { adults: "3", diet: "veg", note: "  ", pets: false })).toEqual({
      adults: 3,
      diet: "veg",
      pets: false,
    });
  });

  it("recaps the answers with the labels the person saw", () => {
    expect(summarise(card, { adults: 3, diet: "veg", pets: true })).toBe(
      "Adults: 3\nDiet: Vegetarian\nPets: Yes",
    );
  });
});

describe("markdown safety helpers", () => {
  it.each(["https://example.com/a", "http://example.com", "mailto:a@b.com", "tel:+911234567890"])(
    "allows %s",
    (url) => expect(safeUrl(url)).toBe(url),
  );

  it.each(["javascript:alert(1)", " JavaScript:alert(1)", "file:///etc/passwd", "festiveos://admin", "data:text/html,x", "/relative", ""])(
    "refuses %s",
    (url) => expect(safeUrl(url)).toBeNull(),
  );

  it("closes a code fence the stream has not finished, and only then", () => {
    expect(closeOpenFences("```py\nprint(1)")).toBe("```py\nprint(1)\n```");
    expect(closeOpenFences("```py\nprint(1)\n```")).toBe("```py\nprint(1)\n```");
    expect(closeOpenFences("no code")).toBe("no code");
  });
});
