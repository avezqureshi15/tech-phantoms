import { describe, expect, it, vi } from "vitest";
import { classifyOutcome, type OutcomeClassification, type OutcomeModel } from "../classifier";

const TRANSCRIPT = [
  "AGENT: I have issued the replacement.",
  "CUSTOMER: Yes, that resolves it. Thank you.",
].join("\n");

function modelReturning(classification: OutcomeClassification): OutcomeModel {
  return vi.fn(async () => JSON.stringify(classification));
}

describe("classifyOutcome", () => {
  it.each([
    ["RESOLVED", "HIGH", "Yes, that resolves it. Thank you.", "The customer explicitly confirmed the replacement fixed the issue."],
    ["ONGOING", "MEDIUM", "AGENT: I have issued the replacement.", "The replacement has been issued and its result is still pending."],
    ["HUMAN_REVIEW", "HIGH", "CUSTOMER: Yes, that resolves it. Thank you.", "A human review was requested."],
  ] as const)("returns a valid %s classification with its evidence", async (outcome, confidence, evidence, rationale) => {
    const result = await classifyOutcome(
      TRANSCRIPT,
      modelReturning({ outcome, confidence, evidence, rationale }),
    );

    expect(result).toEqual({ outcome, confidence, evidence, rationale });
  });

  it("sends the complete transcript and explicit confirmation criteria to the injected model", async () => {
    const model = vi.fn(async () => JSON.stringify({
      outcome: "RESOLVED",
      confidence: "HIGH",
      evidence: "Yes, that resolves it. Thank you.",
      rationale: "The customer explicitly confirmed the replacement fixed the issue.",
    }));

    await classifyOutcome(TRANSCRIPT, model);

    expect(model).toHaveBeenCalledOnce();
    expect(model.mock.calls[0]?.[0]).toContain(TRANSCRIPT);
    expect(model.mock.calls[0]?.[0]).toContain("explicitly confirms");
    expect(model.mock.calls[0]?.[1]).toEqual({ temperature: 0 });
  });

  it("forces HUMAN_REVIEW for LOW confidence while retaining a verified quote", async () => {
    const result = await classifyOutcome(
      TRANSCRIPT,
      modelReturning({
        outcome: "RESOLVED",
        confidence: "LOW",
        evidence: "Yes, that resolves it. Thank you.",
        rationale: "The customer appears satisfied.",
      }),
    );

    expect(result).toMatchObject({
      outcome: "HUMAN_REVIEW",
      confidence: "LOW",
      evidence: "Yes, that resolves it. Thank you.",
    });
  });

  it("lowers confidence when a human-review classification has no evidence", async () => {
    const result = await classifyOutcome(
      TRANSCRIPT,
      modelReturning({
        outcome: "HUMAN_REVIEW",
        confidence: "HIGH",
        evidence: "",
        rationale: "A human was requested.",
      }),
    );

    expect(result).toMatchObject({ outcome: "HUMAN_REVIEW", confidence: "LOW", evidence: "" });
  });

  it.each([
    ["empty", ""],
    ["fabricated", "CUSTOMER: The refund arrived today."],
  ])("forces HUMAN_REVIEW and discards %s evidence", async (_description, evidence) => {
    const result = await classifyOutcome(
      TRANSCRIPT,
      modelReturning({
        outcome: "ONGOING",
        confidence: "HIGH",
        evidence,
        rationale: "The request remains in progress.",
      }),
    );

    expect(result.outcome).toBe("HUMAN_REVIEW");
    expect(result.confidence).toBe("LOW");
    expect(result.evidence).toBe("");
  });

  it("does not accept an agent quote as customer confirmation for RESOLVED", async () => {
    const result = await classifyOutcome(
      TRANSCRIPT,
      modelReturning({
        outcome: "RESOLVED",
        confidence: "HIGH",
        evidence: "AGENT: I have issued the replacement.",
        rationale: "The agent says the issue is resolved.",
      }),
    );

    expect(result.outcome).toBe("HUMAN_REVIEW");
  });

  it("does not treat a customer update as explicit satisfaction", async () => {
    const transcript = "CUSTOMER: The package arrived yesterday.";
    const result = await classifyOutcome(
      transcript,
      modelReturning({
        outcome: "RESOLVED",
        confidence: "HIGH",
        evidence: "The package arrived yesterday.",
        rationale: "The customer says it arrived.",
      }),
    );

    expect(result.outcome).toBe("HUMAN_REVIEW");
  });

  it.each([
    "not JSON",
    JSON.stringify({ outcome: "DONE", confidence: "HIGH", evidence: "quote", rationale: "Invalid outcome." }),
    JSON.stringify({ outcome: "ONGOING", confidence: "HIGH", evidence: "quote", rationale: "Missing field.", extra: true }),
  ])("forces HUMAN_REVIEW for malformed model output: %s", async (response) => {
    const result = await classifyOutcome(TRANSCRIPT, async () => response);

    expect(result).toMatchObject({ outcome: "HUMAN_REVIEW", confidence: "LOW", evidence: "" });
  });

  it("forces HUMAN_REVIEW when the model call fails", async () => {
    const result = await classifyOutcome(TRANSCRIPT, async () => {
      throw new Error("LLM unavailable");
    });

    expect(result).toMatchObject({ outcome: "HUMAN_REVIEW", confidence: "LOW", evidence: "" });
  });
});
