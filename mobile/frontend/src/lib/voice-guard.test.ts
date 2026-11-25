import { isEcho, isNoise, MAX_SESSION_MS, MAX_TURNS, overBudget, wordsOf } from "@/lib/voice-guard";

describe("what is not worth sending", () => {
  it.each(["", "   ", ".", "...", "।", "a", "- -"])("treats %p as noise", (heard) => {
    expect(isNoise(heard)).toBe(true);
  });

  it.each(["Namaste", "हाँ", "yes", "Ganesh aarti please"])("lets %p through", (heard) => {
    expect(isNoise(heard)).toBe(false);
  });

  it("splits words on punctuation and danda marks in any script", () => {
    expect(wordsOf("नमस्ते जी। बताइए, क्या?")).toEqual(["नमस्ते", "जी", "बताइए", "क्या"]);
  });
});

describe("the phone hearing its own voice", () => {
  const spoken = "Namaste ji. Tell me, how can I help you today?";

  it("spots the phone's own words coming back", () => {
    expect(isEcho("Namaste ji. Tell me, how can I help you today?", spoken)).toBe(true);
    expect(isEcho("tell me how can I help you", spoken)).toBe(true);
  });

  it("does not mistake a real answer for an echo", () => {
    expect(isEcho("Please play the Hanuman Chalisa", spoken)).toBe(false);
    expect(isEcho("Namaste", "Namaste ji. Tell me, how can I help you today?")).toBe(true); // one echoed word
    expect(isEcho("help me with Diwali shopping please", spoken)).toBe(false);
  });

  it("does not count a long answer that happens to reuse a few words", () => {
    expect(isEcho("yes please tell me about the Diwali lakshmi puja and the sweets we should make", spoken)).toBe(
      false,
    );
  });

  it("never calls it an echo when there is nothing to compare", () => {
    expect(isEcho("hello", "")).toBe(false);
    expect(isEcho("", spoken)).toBe(false);
  });
});

describe("one sitting has limits", () => {
  it("allows a normal conversation", () => {
    expect(overBudget({ turns: 5, startedAt: 1 }, 5 * 60_000)).toBe(false);
  });

  it("has not started counting before the first turn", () => {
    expect(overBudget({ turns: 0, startedAt: 0 }, 9_999_999_999_999)).toBe(false);
  });

  it("stops after too many turns", () => {
    expect(overBudget({ turns: MAX_TURNS, startedAt: 1 }, 1000)).toBe(true);
  });

  it("stops after too long", () => {
    expect(overBudget({ turns: 1, startedAt: 1 }, MAX_SESSION_MS + 1)).toBe(true);
  });
});
