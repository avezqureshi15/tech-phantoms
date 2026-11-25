import type OpenAI from "openai";
import { getSarvamLLM, SARVAM_LLM_MODEL } from "../sarvam/llm";
import { AGENT_TOOLS, CALL_AGENT_TOOLS } from "./tools";
import { authoriseGetOrderStatus, authoriseRefund, type FlagSnapshot, type PolicyDecision } from "../policy/engine";
import { scoped } from "../db/scoped";
import type { CommerceAdapter, RefundResult } from "../adapters/types";
import { triggerApprovalWorkflow } from "../nudgebee/trigger";
import type { Prisma } from "../generated/prisma";
import type { KnowledgeArticle } from "../knowledge/retrieve";

/** Prisma's Json columns want plain JSON-shaped objects, not our typed interfaces. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

const MAX_ITERATIONS = 4;
const FALLBACK_ESCALATION_REPLY = "Main aapko team se connect kar raha hoon, ek second.";
const FALLBACK_WRAP_UP_REPLY = "Dhanyavaad — aapka request process ho gaya hai.";

export interface ToolExecutionContext {
  tenantId: string;
  tenantSlug: string;
  ticketId: string;
  callSessionId?: string;
  customerName: string;
  /** Order ids injected into this ticket's context (§5.4) — the only ones a tool call may reference. */
  contextOrderIds: string[];
  flags: FlagSnapshot;
  adapter: CommerceAdapter;
  knowledgeArticles?: KnowledgeArticle[];
  deadlineAt?: number;
}

export interface AgentActionSummary {
  tool: string;
  args: Record<string, unknown>;
  policyDecision: PolicyDecision;
  denyReason?: string;
  executed: boolean;
  approvalId?: string;
  result?: unknown;
}

export interface AgentTurnResult {
  replyText: string;
  action: AgentActionSummary | null;
  citedArticleIds: string[];
  shouldEndCall: boolean;
}

function assertWithinDeadline(ctx: ToolExecutionContext): void {
  if (ctx.deadlineAt !== undefined && Date.now() >= ctx.deadlineAt) {
    throw new Error("call turn deadline exceeded");
  }
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function executeGetOrderStatus(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<{ toolResult: unknown; action: AgentActionSummary }> {
  const orderId = String(args.orderId ?? "");
  assertWithinDeadline(ctx);
  const order = await ctx.adapter.getOrder(orderId);

  const verdict = authoriseGetOrderStatus({
    tenantId: ctx.tenantId,
    orderId,
    contextOrderIds: ctx.contextOrderIds,
    order,
  });

  const db = scoped(ctx.tenantId);
  await db.agentAction.create({
    ticketId: ctx.ticketId,
    callSessionId: ctx.callSessionId,
    tool: "get_order_status",
    args: { orderId },
    policyDecision: verdict.decision,
    denyReason: verdict.reason,
    flagSnapshot: toJson(ctx.flags),
    executed: verdict.decision === "ALLOW",
    result: verdict.decision === "ALLOW" && order ? toJson(order) : undefined,
  });

  const toolResult = verdict.decision === "ALLOW" ? { ok: true, order } : { ok: false, reason: verdict.reason };

  return {
    toolResult,
    action: {
      tool: "get_order_status",
      args: { orderId },
      policyDecision: verdict.decision,
      denyReason: verdict.reason,
      executed: verdict.decision === "ALLOW",
      result: verdict.decision === "ALLOW" ? order : undefined,
    },
  };
}

async function executeIssueRefund(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<{ toolResult: unknown; action: AgentActionSummary }> {
  const orderId = String(args.orderId ?? "");
  const amountInr = Number(args.amountInr ?? 0);
  const reason = String(args.reason ?? "");

  assertWithinDeadline(ctx);
  const order = await ctx.adapter.getOrder(orderId);
  const verdict = authoriseRefund({
    tenantId: ctx.tenantId,
    orderId,
    amountInr,
    contextOrderIds: ctx.contextOrderIds,
    order,
    flags: ctx.flags,
  });

  let decision = verdict.decision;
  let denyReason = verdict.reason;
  let executed = false;
  let adapterResult: RefundResult | undefined;

  // §5.3 rule 3: tool results carry the policy verdict so the model can
  // phrase the outcome truthfully, and never hints at the ceiling.
  if (decision === "ALLOW") {
    assertWithinDeadline(ctx);
    adapterResult = await ctx.adapter.issueRefund(orderId, amountInr, reason);
    if (adapterResult.ok) {
      executed = true;
    } else {
      // the adapter caught something policy didn't (e.g. a race) — treat as a deny.
      decision = "DENY";
      denyReason = adapterResult.reason ?? "refund could not be executed";
    }
  }

  const db = scoped(ctx.tenantId);
  const agentAction = await db.agentAction.create({
    ticketId: ctx.ticketId,
    callSessionId: ctx.callSessionId,
    tool: "issue_refund",
    args: { orderId, amountInr, reason },
    policyDecision: decision,
    denyReason,
    flagSnapshot: toJson(ctx.flags),
    executed,
    result: adapterResult ? toJson(adapterResult) : undefined,
  });

  let approvalId: string | undefined;
  if (decision === "REQUIRE_HUMAN") {
    const approval = await db.approval.create({
      ticketId: ctx.ticketId,
      agentActionId: agentAction.id,
    });
    approvalId = approval.id;

    if (!process.env.PUBLIC_BASE_URL) {
      // A hosted NudgeBee workflow cannot POST back to localhost — this needs
      // a tunnel (cloudflared/ngrok) or a deployed server before G3 can work.
      console.warn(
        "PUBLIC_BASE_URL is not set — the approval callback URL will point at localhost, " +
          "which a hosted NudgeBee workflow cannot reach.",
      );
    }
    const baseUrl = process.env.PUBLIC_BASE_URL ?? "http://localhost:4000";
    await triggerApprovalWorkflow({
      approvalId: approval.id,
      ticketId: ctx.ticketId,
      tenantSlug: ctx.tenantSlug,
      orderId,
      amountInr,
      customerName: ctx.customerName,
      reason,
      callbackUrl: `${baseUrl}/api/approvals/callback`,
      callbackSecret: process.env.APPROVAL_CALLBACK_SECRET ?? "",
    });
  }

  const toolResult =
    decision === "ALLOW"
      ? adapterResult
      : decision === "REQUIRE_HUMAN"
        ? { ok: false, pending: true, approvalId }
        : { ok: false, reason: denyReason };

  return {
    toolResult,
    action: {
      tool: "issue_refund",
      args: { orderId, amountInr, reason },
      policyDecision: decision,
      denyReason,
      executed,
      approvalId,
      result: adapterResult,
    },
  };
}

/**
 * The tool-calling loop (§5.3). One customer turn typically costs two LLM
 * calls: one that decides to act, one that composes the spoken reply.
 */
export async function runAgentTurn(
  messages: OpenAI.ChatCompletionMessageParam[],
  ctx: ToolExecutionContext,
): Promise<AgentTurnResult> {
  let action: AgentActionSummary | null = null;
  let wroteThisTurn = false;
  let shouldEndCall = false;
  const citedArticleIds = new Set<string>();
  const tools = ctx.callSessionId ? CALL_AGENT_TOOLS : AGENT_TOOLS;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    assertWithinDeadline(ctx);
    const completion = await getSarvamLLM().chat.completions.create(
      {
        model: SARVAM_LLM_MODEL,
        messages,
        tools,
      },
      ctx.deadlineAt === undefined
        ? undefined
        : { signal: AbortSignal.timeout(Math.max(1, ctx.deadlineAt - Date.now())) },
    );

    const message = completion.choices[0]?.message;
    if (!message) break;

    const toolCalls = message.tool_calls?.filter((call) => call.type === "function") ?? [];

    if (toolCalls.length === 0) {
      return {
        replyText: message.content ?? "",
        action,
        citedArticleIds: [...citedArticleIds],
        shouldEndCall,
      };
    }

    messages.push(message);

    for (const call of toolCalls) {
      const args = parseArgs(call.function.arguments);
      let toolResult: unknown;

      assertWithinDeadline(ctx);

      if (call.function.name === "get_order_status") {
        const outcome = await executeGetOrderStatus(args, ctx);
        toolResult = outcome.toolResult;
        action = outcome.action;
      } else if (call.function.name === "issue_refund") {
        if (wroteThisTurn) {
          // §5.3 rule 2: one write per customer turn — the double-refund guard.
          toolResult = { ok: false, reason: "one action per turn" };
        } else {
          const outcome = await executeIssueRefund(args, ctx);
          toolResult = outcome.toolResult;
          action = outcome.action;
          wroteThisTurn = true;
        }
      } else if (call.function.name === "escalate_to_human") {
        toolResult = { ok: true, escalated: true };
        action = { tool: "escalate_to_human", args, policyDecision: "ALLOW", executed: true, result: toolResult };
      } else if (call.function.name === "end_call") {
        if (!ctx.callSessionId) {
          toolResult = { ok: false, reason: "end_call is only available in a phone call" };
        } else if (shouldEndCall) {
          toolResult = { ok: true, alreadyEnding: true };
        } else {
          const reason = String(args.reason ?? "conversation complete").slice(0, 240);
          const endAction: AgentActionSummary = {
            tool: "end_call",
            args: { reason },
            policyDecision: "ALLOW",
            executed: true,
            result: { ok: true },
          };
          await scoped(ctx.tenantId).agentAction.create({
            ticketId: ctx.ticketId,
            callSessionId: ctx.callSessionId,
            tool: "end_call",
            args: { reason },
            policyDecision: "ALLOW",
            flagSnapshot: toJson(ctx.flags),
            executed: true,
            result: toJson({ ok: true }),
          });
          if (!action) action = endAction;
          shouldEndCall = true;
          toolResult = { ok: true };
        }
      } else if (call.function.name === "cite_knowledge_article") {
        const articleId = String(args.articleId ?? "");
        const article = ctx.knowledgeArticles?.find((candidate) => candidate.id === articleId);
        if (!article) {
          toolResult = { ok: false, reason: "article is not in the supplied knowledge context" };
        } else {
          citedArticleIds.add(article.id);
          toolResult = { ok: true, articleId: article.id, title: article.title };
        }
      } else {
        toolResult = { ok: false, reason: "unknown tool" };
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  // §5.3 rule 1: hard cap of 4 iterations — never loop forever. But if a real
  // action (e.g. an executed refund) already happened this turn, report that
  // instead of overwriting it with a manufactured escalation — the action and
  // its AgentAction row must agree on what actually happened.
  if (shouldEndCall) {
    return {
      replyText: "Dhanyavaad, aapse baat karke achha laga. Namaste.",
      action,
      citedArticleIds: [...citedArticleIds],
      shouldEndCall: true,
    };
  }
  if (!action) {
    action = {
      tool: "escalate_to_human",
      args: { summary: "conversation exceeded the tool-call limit", urgency: "high" },
      policyDecision: "ALLOW",
      executed: true,
    };
    return { replyText: FALLBACK_ESCALATION_REPLY, action, citedArticleIds: [...citedArticleIds], shouldEndCall };
  }
  return { replyText: FALLBACK_WRAP_UP_REPLY, action, citedArticleIds: [...citedArticleIds], shouldEndCall };
}
