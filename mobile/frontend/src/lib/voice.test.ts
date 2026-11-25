import { MAX_RECORDING_SECONDS, mergeTranscript } from "@/lib/voice";

describe("mergeTranscript", () => {
  it("starts from nothing", () => expect(mergeTranscript("", " plan Diwali ")).toBe("plan Diwali"));
  it("appends to what was typed with exactly one space", () => {
    expect(mergeTranscript("Hello  ", "plan Diwali")).toBe("Hello plan Diwali");
  });
  it("keeps what was typed when nothing was heard", () => expect(mergeTranscript("Hello", "  ")).toBe("Hello"));
  it("keeps non-latin text intact, whatever language was spoken", () => {
    expect(mergeTranscript("", "ನಮ್ಮ ಮನೆಯಲ್ಲಿ ಹಬ್ಬ")).toBe("ನಮ್ಮ ಮನೆಯಲ್ಲಿ ಹಬ್ಬ");
    expect(mergeTranscript("Add", "दिवाली")).toBe("Add दिवाली");
  });
  it("stops a clip at the speech service's limit", () => expect(MAX_RECORDING_SECONDS).toBe(30));
});
