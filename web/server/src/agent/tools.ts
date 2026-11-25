import type OpenAI from "openai";

/**
 * The 3 tools (BUILD-PLAN §5.1). Flat, strictly typed schemas — open-weight
 * models are far more reliable with three flat tools than with twelve nested
 * ones. `issue_refund` is the only write tool that's policy-gated;
 * `escalate_to_human` is never blocked.
 */
export const AGENT_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_order_status",
      description:
        "Get the current status, items, and delivery details for one of this customer's orders.",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "The order id, e.g. ORD-1042" },
        },
        required: ["orderId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "issue_refund",
      description:
        "Issue a refund for an order. Subject to policy: may execute immediately, be denied, or require human approval.",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "The order id, e.g. ORD-1042" },
          amountInr: { type: "number", description: "Refund amount in INR. Must be greater than zero." },
          reason: { type: "string", description: "Why this refund is being issued." },
        },
        required: ["orderId", "amountInr", "reason"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate_to_human",
      description:
        "Hand this conversation off to a human agent. Always available — use it whenever you are unsure, or the customer's issue isn't covered by your other tools.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "A short summary of the issue for the human agent." },
          urgency: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["summary", "urgency"],
        additionalProperties: false,
      },
    },
  },
];

export const END_CALL_TOOL: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "end_call",
    description: "End the phone call after a polite closing, when the customer asks to stop, or when no further help is needed.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Short reason the call is ending." },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
};

export const CITE_ARTICLE_TOOL: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "cite_knowledge_article",
    description: "Record which supplied knowledge article you relied on to answer the customer.",
    parameters: {
      type: "object",
      properties: {
        articleId: { type: "string", description: "The id of an article in the KNOWLEDGE block." },
      },
      required: ["articleId"],
      additionalProperties: false,
    },
  },
};

/** Keep the three-tool browser demo unchanged; call sessions opt into these additions. */
export const CALL_AGENT_TOOLS: OpenAI.ChatCompletionTool[] = [
  ...AGENT_TOOLS,
  END_CALL_TOOL,
  CITE_ARTICLE_TOOL,
];
