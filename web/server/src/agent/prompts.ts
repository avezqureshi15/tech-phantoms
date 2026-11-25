import type { Order } from "../generated/prisma";
import type { ResolvedFlags } from "../flags/client";
import type { KnowledgeArticle } from "../knowledge/retrieve";

const PROBLEM_ORDER_WINDOW_HOURS = 24;

/** A "problem order" per §5.4: DELAYED, DISPATCHED past promisedAt, or DELIVERED within 24h. */
function isProblemOrder(order: Order, now: Date): boolean {
  if (order.status === "DELAYED") return true;
  if (order.status === "DISPATCHED" && order.promisedAt.getTime() < now.getTime()) return true;
  if (order.status === "DELIVERED" && order.deliveredAt) {
    const hoursSinceDelivery = (now.getTime() - order.deliveredAt.getTime()) / (60 * 60 * 1000);
    return hoursSinceDelivery < PROBLEM_ORDER_WINDOW_HOURS;
  }
  return false;
}

export interface ContextSelection {
  /** Orders injected into this ticket's context — the only ones a tool call may reference (§5.4). */
  contextOrders: Order[];
  /** More than one problem order found — the agent must ask one disambiguating question. */
  needsDisambiguation: boolean;
}

/**
 * The §5.4 disambiguation table, resolved deterministically in the context
 * builder — never left to the model.
 */
export function selectContextOrders(customerOrders: Order[], now: Date = new Date()): ContextSelection {
  const problemOrders = customerOrders
    .filter((o) => isProblemOrder(o, now))
    .sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime());

  if (problemOrders.length === 1) {
    return { contextOrders: problemOrders, needsDisambiguation: false };
  }

  if (problemOrders.length > 1) {
    return { contextOrders: problemOrders.slice(0, 3), needsDisambiguation: true };
  }

  const mostRecent = [...customerOrders].sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime())[0];
  return { contextOrders: mostRecent ? [mostRecent] : [], needsDisambiguation: false };
}

export function buildSystemPrompt(tenant: { name: string; brandTone: string }): string {
  return `You are Diya, the AI support agent for ${tenant.name}. Speak in a ${tenant.brandTone} tone.

It is Diwali week. Deliveries are running late across the country — be warm, specific, and patient.

Hard constraints:
- When a customer asks for a refund on an order you can see in CONTEXT, always call issue_refund
  with that order and the amount — even if you think it is above the auto-approval limit. Never
  decide for yourself that a refund needs human approval and jump straight to escalate_to_human;
  the issue_refund tool result will tell you exactly what happened (executed, denied, or pending
  human approval), and only then do you report that outcome to the customer.
- Never tell the customer a refund happened unless a tool result confirms it executed.
- Never invent a delivery ETA — only state what the order data gives you.
- Use escalate_to_human only for issues get_order_status and issue_refund cannot handle at all
  (not simply because a refund might be large).
- Reply in the same language/script mix the customer used — Hinglish stays Hinglish.
- If a refund needs human approval, say so plainly and warmly. Never imply it already happened.
- You may reference only the order(s) given to you in CONTEXT below. Never invent or guess an order id.`;
}

export function buildCallSystemPrompt(tenant: { name: string; brandTone: string }): string {
  return `${buildSystemPrompt(tenant)}

Phone-call rules:
- You are speaking live with the customer. The opening line and recording disclosure have already been spoken.
- Keep spoken replies brief and natural. Continue in the language and script mix the customer uses.
- Answer policy and product questions only from the supplied KNOWLEDGE block. If no article covers the question, explain that and escalate rather than inventing policy.
- When an article materially informs your answer, call cite_knowledge_article with its supplied id. Never cite an article that was not supplied.
- Call end_call after the customer asks to stop, says goodbye, or the conversation is complete. Do not end while a requested action is pending.
- A successful action is not proof the customer is satisfied. Do not claim the issue is resolved without the customer's explicit confirmation.`;
}

export function buildOpeningLine(input: {
  tenantName: string;
  customerName: string;
  orderId: string;
  issueSummary: string;
}): string {
  return `Namaste ${input.customerName}, main Diya ${input.tenantName} se bol rahi hoon. ` +
    `Aapke order ${input.orderId} ke baare mein baat karne ke liye call kiya hai: ${input.issueSummary}. ` +
    `Is call ki recording ki ja sakti hai. Aap mujhe bata sakte hain ki is baare mein aapki kya chinta hai?`;
}

export function buildKnowledgeBlock(articles: readonly KnowledgeArticle[]): string {
  if (articles.length === 0) {
    return "KNOWLEDGE:\nNo matching articles were found. Do not invent product or policy information; escalate when an answer needs policy knowledge.";
  }
  return `KNOWLEDGE:\n${articles.map((article) =>
    `- id=${article.id}; title=${article.title}; category=${article.category}\n  ${article.body}`,
  ).join("\n")}`;
}

function describeItems(items: unknown): string {
  if (!Array.isArray(items)) return String(items);
  return items
    .map((item) => {
      if (item && typeof item === "object" && "name" in item && "qty" in item) {
        const i = item as { name: string; qty: number };
        return `${i.qty}x ${i.name}`;
      }
      return JSON.stringify(item);
    })
    .join(", ");
}

export function buildContextBlock(
  customer: { name: string },
  selection: ContextSelection,
  flags: ResolvedFlags,
): string {
  const ordersBlock =
    selection.contextOrders.length > 0
      ? selection.contextOrders
          .map(
            (o) =>
              `- ${o.id}: ${describeItems(o.items)} — ₹${o.amountInr}, status=${o.status}` +
              `, promised=${o.promisedAt.toISOString().slice(0, 10)}` +
              (o.riderEtaMins ? `, riderEtaMins=${o.riderEtaMins}` : "") +
              `, festiveGift=${o.isFestiveGift}, refundedInr=${o.refundedInr}`,
          )
          .join("\n")
      : "(no orders found for this customer)";

  const disambiguationNote = selection.needsDisambiguation
    ? "\n\nThis customer has more than one order that may need attention. Ask ONE short question naming the items (e.g. \"Diwali sweet box wala ya kurta wala?\") before taking any action."
    : "";

  return `CUSTOMER: ${customer.name}

ORDERS:
${ordersBlock}

POLICY: Refunds up to ₹${flags.auto_refund_limit_inr} can be issued automatically. Above that, a human must approve.${disambiguationNote}`;
}
