export type Outcome = "RESOLVED" | "ONGOING" | "HUMAN_REVIEW";
export type OutcomeConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface OutcomeClassification {
  outcome: Outcome;
  confidence: OutcomeConfidence;
  evidence: string;
  rationale: string;
}

export type OutcomeModel = (prompt: string, options: { temperature: number }) => Promise<string>;

const OUTCOMES = ["RESOLVED", "ONGOING", "HUMAN_REVIEW"] as const;
const CONFIDENCES = ["HIGH", "MEDIUM", "LOW"] as const;
const RESPONSE_KEYS = ["outcome", "confidence", "evidence", "rationale"];

const PROMPT = `Classify the call outcome from the full transcript below. Return strict JSON only, with exactly these keys and string values:
{"outcome":"RESOLVED","confidence":"HIGH","evidence":"verbatim transcript quote","rationale":"one sentence"}
Allowed outcomes: RESOLVED, ONGOING, HUMAN_REVIEW. Allowed confidence values: HIGH, MEDIUM, LOW.

Criteria:
- RESOLVED only when the customer explicitly confirms they are satisfied or explicitly accepts an action that was executed. The agent saying the issue is resolved is not confirmation.
- ONGOING when something was promised, the customer wants time, or an approval is pending.
- HUMAN_REVIEW when the agent could not help, the customer is dissatisfied or angry, a policy edge case arose, or the call dropped mid-conversation.
- Quote evidence exactly from the transcript. For RESOLVED, evidence must be the customer's own explicit confirmation, not the agent's words. Never invent or paraphrase a quote.
- Use LOW confidence whenever the transcript does not clearly support the classification. Do not classify as RESOLVED without explicit customer confirmation.

Full transcript:
`;

function humanReview(rationale: string, evidence = ""): OutcomeClassification {
  return { outcome: "HUMAN_REVIEW", confidence: "LOW", evidence, rationale };
}

function parseResponse(response: string): OutcomeClassification | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(response);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

  const value = parsed as Record<string, unknown>;
  const keys = Object.keys(value);
  if (
    keys.length !== RESPONSE_KEYS.length ||
    !RESPONSE_KEYS.every((key) => keys.includes(key)) ||
    typeof value.outcome !== "string" ||
    !OUTCOMES.includes(value.outcome as Outcome) ||
    typeof value.confidence !== "string" ||
    !CONFIDENCES.includes(value.confidence as OutcomeConfidence) ||
    typeof value.evidence !== "string" ||
    typeof value.rationale !== "string" ||
    value.rationale.trim().length === 0
  ) {
    return null;
  }

  return {
    outcome: value.outcome as Outcome,
    confidence: value.confidence as OutcomeConfidence,
    evidence: value.evidence,
    rationale: value.rationale,
  };
}

export function isCustomerQuote(transcript: string, evidence: string): boolean {
  const speakerPattern = /(?:^|\n)\s*(?:\[)?(customer|caller|user|agent|assistant)(?:\])?\s*:\s*/gi;
  const speakers = [...transcript.matchAll(speakerPattern)];

  return speakers.some((speaker, index) => {
    if (!speaker[1] || !["customer", "caller", "user"].includes(speaker[1].toLowerCase())) {
      return false;
    }

    const start = speaker.index! + speaker[0].length;
    const end = speakers[index + 1]?.index ?? transcript.length;
    return transcript.slice(start, end).includes(evidence);
  });
}

export function isExplicitCustomerConfirmation(evidence: string): boolean {
  const quote = evidence.replace(/^\s*(?:\[)?(?:customer|caller|user)(?:\])?\s*:\s*/i, "");
  const confirmation = /\b(?:yes|yeah|yep|that (?:works|solves|resolved|fixed)|(?:it is|it's) (?:fine|resolved|fixed|sorted|working)|all good|issue is resolved|problem is solved|haan(?:,?\s+)(?:theek|sahi)|theek hai|ab theek|ho gaya|mil gaya)\b/i;
  const unresolved = /\b(?:not resolved|still not|not yet|but|however|maybe|perhaps|not sure|sort of|kind of|nahi hua|nahi mila|abhi nahi|abhi tak nahi)\b/i;
  return confirmation.test(quote) && !unresolved.test(quote);
}

/** Classify a complete call transcript using an injected model that returns raw JSON text. */
export async function classifyOutcome(
  transcript: string,
  model: OutcomeModel,
  options: { customerTurns?: readonly string[] } = {},
): Promise<OutcomeClassification> {
  let response: string;
  try {
    response = await model(`${PROMPT}${transcript}`, { temperature: 0 });
  } catch {
    return humanReview("The classifier failed, so this call needs human review.");
  }

  const classification = typeof response === "string" ? parseResponse(response) : null;
  if (!classification) {
    return humanReview("The classifier returned a malformed response, so this call needs human review.");
  }

  if (classification.evidence.trim().length === 0) {
    return humanReview("The classifier provided no evidence, so this call needs human review.");
  }

  if (!transcript.includes(classification.evidence)) {
    return humanReview("The classifier evidence was not found verbatim in the transcript.");
  }

  if (classification.confidence === "LOW") {
    return humanReview("The classifier returned LOW confidence, so this call needs human review.", classification.evidence);
  }

  const isVerifiedCustomerQuote = options.customerTurns
    ? options.customerTurns.some((turn) => turn.includes(classification.evidence))
    : isCustomerQuote(transcript, classification.evidence);
  if (classification.outcome === "RESOLVED" && (!isVerifiedCustomerQuote || !isExplicitCustomerConfirmation(classification.evidence))) {
    return humanReview("Customer confirmation could not be verified from the cited transcript quote.", classification.evidence);
  }

  return classification;
}
