import {
  CALL_LANGUAGES,
  CONSENT_TEXT,
  callbackResultSchema,
  normalizePhone,
  problemWith,
  toRequest,
  withCountryCode,
  type CallbackForm,
} from "@/lib/support";

const form = (over: Partial<CallbackForm> = {}): CallbackForm => ({
  phone: "+91 98765 43210",
  language: "kn-IN",
  topic: "expense_dispute",
  note: "",
  consent: true,
  ...over,
});

describe("phone numbers", () => {
  it("accepts international numbers however they are spaced", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("+919876543210");
    expect(normalizePhone("+1 (415) 555-0132")).toBe("+14155550132");
  });

  it.each(["9876543210", "+0123456789", "+91", "call me", "", "+9198765432101234567"])("rejects %p", (raw) => {
    expect(normalizePhone(raw)).toBeNull();
  });

  it("adds +91 only to a plain ten-digit mobile number", () => {
    expect(withCountryCode("98765 43210")).toBe("+919876543210");
    expect(withCountryCode("+44 7700 900123")).toBe("+44 7700 900123"); // already international: left alone
    expect(withCountryCode("12345")).toBe("12345"); // not a mobile number: not guessed at
    expect(withCountryCode("")).toBe("");
  });
});

describe("the call-back form", () => {
  it("can be sent when it is complete and the person has agreed", () => {
    expect(problemWith(form())).toBeNull();
  });

  it("will not be sent without a clear yes", () => {
    expect(problemWith(form({ consent: false }))).toMatch(/tick the box/i);
  });

  it("will not be sent with a number that cannot be called", () => {
    expect(problemWith(form({ phone: "not a number" }))).toMatch(/country code/i);
  });

  it("accepts a ten-digit Indian mobile number typed without the +91", () => {
    expect(problemWith(form({ phone: "98765 43210" }))).toBeNull();
    expect(toRequest(form({ phone: "98765 43210" })).phone).toBe("+919876543210");
  });

  it("sends the language, topic and a tidied note, and an explicit consent", () => {
    const body = toRequest(form({ note: "  wrong split  " }));
    expect(body).toEqual({
      phone: "+919876543210",
      language: "kn-IN",
      topic: "expense_dispute",
      note: "wrong split",
      consent: true,
    });
  });

  it("leaves the note out when it is empty", () => {
    expect(toRequest(form({ note: "   " })).note).toBeUndefined();
  });

  it("limits the note to what the server accepts", () => {
    expect(problemWith(form({ note: "x".repeat(301) }))).toMatch(/under 300/);
  });
});

describe("the wording and the answer", () => {
  it("says plainly who may call, and what is shared", () => {
    expect(CONSENT_TEXT).toMatch(/may phone me/);
    expect(CONSENT_TEXT).toMatch(/name, number, language and note/);
  });

  it("offers the languages the server accepts, including the Indian ones people speak", () => {
    const codes = CALL_LANGUAGES.map((l) => l.value);
    for (const code of ["en-IN", "hi-IN", "kn-IN", "ta-IN", "te-IN"]) expect(codes).toContain(code);
  });

  it("understands the server's answers and rejects anything else", () => {
    expect(
      callbackResultSchema.safeParse({ id: "1", status: "sent", created_at: "2026-11-25T10:00:00Z" }).success,
    ).toBe(true);
    expect(callbackResultSchema.safeParse({ id: "1", status: "do_not_call", created_at: "x" }).success).toBe(true);
    expect(callbackResultSchema.safeParse({ id: "1", status: "maybe", created_at: "x" }).success).toBe(false);
  });
});
