import { prismaUnscoped } from "./prisma";
import type { Confidence, Decision, Outcome, Prisma, Priority, QueryStatus, TicketStatus } from "../generated/prisma";

/** Prisma's Json columns want plain JSON-shaped values, not our typed records. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * Finished call histories for the dashboard demo. `reseedDemoData` truncates
 * first, so these are plain creates. Every outcome's `evidence` is a verbatim
 * substring of a CUSTOMER turn, matching the rule the classifier and the
 * operator-override endpoint both enforce.
 */

interface TurnSeed {
  role: "AGENT" | "CUSTOMER";
  text: string;
  endCall?: boolean;
  cites?: string[];
}

interface ActionSeed {
  tool: string;
  args: Record<string, unknown>;
  policyDecision: Decision;
  denyReason?: string;
  executed: boolean;
  result?: Record<string, unknown>;
  pendingApproval?: boolean;
}

interface Scenario {
  key: string;
  tenantSlug: string;
  orderId: string;
  issueSummary: string;
  category: string;
  priority: Priority;
  queryStatus: QueryStatus;
  ticketStatus: TicketStatus;
  resolutionType?: string;
  callState: "ENDED" | "FAILED";
  durationSec?: number;
  errorCode?: string;
  errorMessage?: string;
  turns: TurnSeed[];
  action?: ActionSeed;
  outcome?: { value: Outcome; confidence: Confidence; evidence: string; rationale: string };
}

function minutesAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 1000);
}

const SCENARIOS: Scenario[] = [
  {
    key: "kurta-exchange",
    tenantSlug: "festive-mart",
    orderId: "ORD-1003",
    issueSummary: "Silk Kurta delivered in the wrong size before a family function.",
    category: "apparel",
    priority: "NORMAL",
    queryStatus: "RESOLVED",
    ticketStatus: "AUTO_RESOLVED",
    resolutionType: "INFO",
    callState: "ENDED",
    durationSec: 96,
    turns: [
      { role: "AGENT", text: "Namaste Ayesha ji, main Festive Mart se Diya bol rahi hoon. Aapke order ORD-1003 mein size ko lekar ek dikkat dikh rahi hai. Aap bataiye kya hua?" },
      { role: "CUSTOMER", text: "Maine large order kiya tha lekin medium aaya hai. Function parso hai, ab kya karoon." },
      { role: "AGENT", text: "Maaf kijiye. Bina pehne hue kapde return window ke andar exchange ho jaate hain. Main large size ka exchange laga deti hoon, kal shaam tak pahunch jayega.", cites: ["wrong-apparel-size", "apparel-exchange-window"] },
      { role: "CUSTOMER", text: "Haan theek hai, ab sab clear ho gaya. Dhanyavaad." },
      { role: "AGENT", text: "Dhanyavaad Ayesha ji, aapka exchange confirm ho gaya hai. Shubh Diwali!", endCall: true },
    ],
    outcome: {
      value: "RESOLVED",
      confidence: "HIGH",
      evidence: "Haan theek hai, ab sab clear ho gaya.",
      rationale: "The customer explicitly confirmed the exchange resolved their problem.",
    },
  },
  {
    key: "hamper-damaged",
    tenantSlug: "festive-mart",
    orderId: "ORD-1001",
    issueSummary: "Premium gift hamper arrived damaged; customer is asking for a full refund.",
    category: "gifting",
    priority: "HIGH",
    queryStatus: "HUMAN_REVIEW",
    ticketStatus: "AWAITING_APPROVAL",
    resolutionType: "HUMAN",
    callState: "ENDED",
    durationSec: 134,
    turns: [
      { role: "AGENT", text: "Namaste Priya ji, main Festive Mart se Diya bol rahi hoon. Aapke Diwali hamper ke baare mein baat karni thi. Kya dikkat hui?" },
      { role: "CUSTOMER", text: "Hamper kharab haalat mein aaya, dabba toota hua tha aur mithai bikhar gayi thi. Mujhe poora refund chahiye." },
      { role: "AGENT", text: "Mujhe bahut khed hai. Itni badi raqam ke refund ke liye mujhe apni team se approval leni hogi, main abhi request bhej rahi hoon.", cites: ["damaged-in-transit", "refund-timeline"] },
      { role: "CUSTOMER", text: "Theek hai par mujhe aaj hi jawab chahiye, yeh gift dene ke liye tha." },
      { role: "AGENT", text: "Bilkul. Hamari team aaj hi aapse sampark karegi. Dhanyavaad.", endCall: true },
    ],
    action: {
      tool: "issue_refund",
      args: { orderId: "ORD-1001", amountInr: 6800, reason: "Premium hamper damaged in transit" },
      policyDecision: "REQUIRE_HUMAN",
      denyReason: "refund above ₹5000 always needs human approval",
      executed: false,
      pendingApproval: true,
    },
    outcome: {
      value: "HUMAN_REVIEW",
      confidence: "MEDIUM",
      evidence: "Mujhe poora refund chahiye.",
      rationale: "A full refund above the autonomous ceiling needs human approval before it can be promised.",
    },
  },
  {
    key: "thali-missing-bowl",
    tenantSlug: "festive-mart",
    orderId: "ORD-1008",
    issueSummary: "Pooja Thali Set delivered with one bowl missing from the set.",
    category: "gifting",
    priority: "NORMAL",
    queryStatus: "ONGOING",
    ticketStatus: "OPEN",
    callState: "ENDED",
    durationSec: 71,
    turns: [
      { role: "AGENT", text: "Hello Rohan, this is Diya calling from Festive Mart about your Pooja Thali Set order. Is everything alright with it?" },
      { role: "CUSTOMER", text: "The thali arrived but one small bowl is missing from the set." },
      { role: "AGENT", text: "I am sorry about that. I can arrange a replacement for the missing bowl once our packing record is checked.", cites: ["missing-item", "replacement-policy"] },
      { role: "CUSTOMER", text: "Okay, let me check with my family and call back." },
      { role: "AGENT", text: "Of course. I will keep this open for you. Thank you, Rohan.", endCall: true },
    ],
    outcome: {
      value: "ONGOING",
      confidence: "MEDIUM",
      evidence: "Okay, let me check with my family and call back.",
      rationale: "The customer asked for time before accepting the replacement, so the issue is still open.",
    },
  },
  {
    key: "lights-unreachable",
    tenantSlug: "festive-mart",
    orderId: "ORD-1009",
    issueSummary: "Fairy Lights order flagged for a delivery follow-up call.",
    category: "decor",
    priority: "NORMAL",
    queryStatus: "FAILED",
    ticketStatus: "ESCALATED",
    callState: "FAILED",
    errorCode: "21608",
    errorMessage: "The destination number must be verified on this Twilio trial account.",
    turns: [],
  },
  {
    key: "ladoo-crushed",
    tenantSlug: "sweet-co",
    orderId: "ORD-2002",
    issueSummary: "Motichoor Ladoo box arrived late with crushed pieces.",
    category: "sweets",
    priority: "NORMAL",
    queryStatus: "RESOLVED",
    ticketStatus: "AUTO_RESOLVED",
    resolutionType: "REFUND",
    callState: "ENDED",
    durationSec: 88,
    turns: [
      { role: "AGENT", text: "Hello Arjun, this is Diya from Sweet Co. calling about your Motichoor Ladoo order. How did it arrive?" },
      { role: "CUSTOMER", text: "The box arrived a day late and some of the ladoos were crushed." },
      { role: "AGENT", text: "I am sorry about that. I have processed a refund of 350 rupees for the affected box, and it will reach you in 3 to 5 working days.", cites: ["sweets-box-damage", "refund-timeline"] },
      { role: "CUSTOMER", text: "Yes, that works for me. Thank you." },
      { role: "AGENT", text: "Thank you Arjun. Happy Diwali!", endCall: true },
    ],
    action: {
      tool: "issue_refund",
      args: { orderId: "ORD-2002", amountInr: 350, reason: "Crushed ladoos on late delivery" },
      policyDecision: "ALLOW",
      executed: true,
      result: { ok: true, refundId: "demo-refund-2002" },
    },
    outcome: {
      value: "RESOLVED",
      confidence: "HIGH",
      evidence: "Yes, that works for me.",
      rationale: "The customer explicitly accepted the refund that was executed during the call.",
    },
  },
  {
    key: "jamun-spoiled",
    tenantSlug: "sweet-co",
    orderId: "ORD-2007",
    issueSummary: "Gulab Jamun tin reported spoiled; customer is unhappy.",
    category: "sweets",
    priority: "HIGH",
    queryStatus: "HUMAN_REVIEW",
    ticketStatus: "ESCALATED",
    resolutionType: "HUMAN",
    callState: "ENDED",
    durationSec: 64,
    turns: [
      { role: "AGENT", text: "Namaste Kavya ji, main Sweet Co. se Diya bol rahi hoon. Aapke Gulab Jamun order ke baare mein baat karni thi." },
      { role: "CUSTOMER", text: "Mithai kharab ho gayi thi aur main bahut naraz hoon. Yeh teesri baar hua hai." },
      { role: "AGENT", text: "Mujhe bahut khed hai. Main is shikayat ko hamari team ke paas bhej rahi hoon, woh aaj aapse baat karenge.", cites: ["sweets-freshness"] },
      { role: "AGENT", text: "Aapke samay ke liye dhanyavaad, Kavya ji.", endCall: true },
    ],
    outcome: {
      value: "HUMAN_REVIEW",
      confidence: "MEDIUM",
      evidence: "Mithai kharab ho gayi thi aur main bahut naraz hoon.",
      rationale: "A repeat quality complaint with an unhappy customer needs a human owner.",
    },
  },
];

function toDialable(phone: string): string {
  const normalized = phone.trim().replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : "+910000000000";
}

export async function seedDemoCallHistory(): Promise<{ calls: number; outcomes: number }> {
  const fromNumber = toDialable(process.env.TWILIO_PHONE_NUMBER ?? "+10000000000");
  let calls = 0;
  let outcomes = 0;

  for (const scenario of SCENARIOS) {
    const tenant = await prismaUnscoped.tenant.findUnique({ where: { slug: scenario.tenantSlug } });
    if (!tenant) continue;
    const order = await prismaUnscoped.order.findFirst({
      where: { id: scenario.orderId, tenantId: tenant.id },
      include: { customer: true },
    });
    if (!order) continue;

    const firstItem = Array.isArray(order.items) && order.items[0] && typeof order.items[0] === "object"
      ? (order.items[0] as { name?: unknown })
      : null;
    const product = typeof firstItem?.name === "string"
      ? await prismaUnscoped.product.findFirst({ where: { tenantId: tenant.id, name: firstItem.name } })
      : null;

    const startedAt = minutesAgo(40 + calls * 17);
    const endedAt = new Date(startedAt.getTime() + (scenario.durationSec ?? 20) * 1000);

    const query = await prismaUnscoped.query.create({
      data: {
        id: `demo-${scenario.key}`,
        tenantId: tenant.id,
        customerId: order.customerId,
        orderId: order.id,
        productId: product?.id,
        issueSummary: scenario.issueSummary,
        category: scenario.category,
        priority: scenario.priority,
        status: scenario.queryStatus,
        attempts: 1,
        detectedAt: minutesAgo(120 + calls * 20),
      },
    });

    const ticket = await prismaUnscoped.ticket.create({
      data: {
        tenantId: tenant.id,
        customerId: order.customerId,
        orderId: order.id,
        channel: "VOICE",
        language: order.customer.preferredLang,
        status: scenario.ticketStatus,
        resolutionType: scenario.resolutionType,
        issueCluster: scenario.category,
        openedAt: startedAt,
        resolvedAt: scenario.ticketStatus === "OPEN" || scenario.ticketStatus === "AWAITING_APPROVAL" ? null : endedAt,
      },
    });

    const session = await prismaUnscoped.callSession.create({
      data: {
        tenantId: tenant.id,
        queryId: query.id,
        ticketId: ticket.id,
        channel: "TWILIO",
        state: scenario.callState,
        providerSid: `CAdemo${scenario.key.replace(/[^a-z0-9]/g, "")}`,
        toNumber: toDialable(order.customer.phone),
        fromNumber,
        startedAt,
        answeredAt: scenario.turns.length > 0 ? startedAt : null,
        endedAt,
        durationSec: scenario.durationSec,
        turnCount: scenario.turns.filter((turn) => turn.role === "CUSTOMER").length,
        answeredBy: scenario.turns.length > 0 ? "human" : null,
        errorCode: scenario.errorCode,
        errorMessage: scenario.errorMessage,
      },
    });
    calls++;

    for (const [idx, turn] of scenario.turns.entries()) {
      const createdAt = new Date(startedAt.getTime() + idx * 12_000);
      await prismaUnscoped.callTurn.create({
        data: {
          tenantId: tenant.id,
          callSessionId: session.id,
          idx,
          role: turn.role,
          text: turn.text,
          lang: order.customer.preferredLang,
          endCall: turn.endCall ?? false,
          latencyMs: turn.role === "AGENT" ? 2400 + idx * 180 : null,
          citedArticleIds: (turn.cites ?? []).map((slug) => `${tenant.slug}-${slug}`),
          createdAt,
        },
      });
      await prismaUnscoped.message.create({
        data: {
          tenantId: tenant.id,
          ticketId: ticket.id,
          role: turn.role,
          text: turn.text,
          lang: order.customer.preferredLang,
          latencyMs: turn.role === "AGENT" ? 2400 + idx * 180 : null,
          createdAt,
        },
      });
    }

    if (scenario.action) {
      const agentAction = await prismaUnscoped.agentAction.create({
        data: {
          tenantId: tenant.id,
          ticketId: ticket.id,
          callSessionId: session.id,
          tool: scenario.action.tool,
          args: toJson(scenario.action.args),
          policyDecision: scenario.action.policyDecision,
          denyReason: scenario.action.denyReason,
          flagSnapshot: toJson({ ai_agent_enabled: true, auto_refund_limit_inr: 2000, human_approval_above_inr: 5000, festive_surge_mode: false }),
          executed: scenario.action.executed,
          result: scenario.action.result ? toJson(scenario.action.result) : undefined,
          createdAt: new Date(startedAt.getTime() + 30_000),
        },
      });
      if (scenario.action.pendingApproval) {
        await prismaUnscoped.approval.create({
          data: {
            tenantId: tenant.id,
            ticketId: ticket.id,
            agentActionId: agentAction.id,
            status: "PENDING",
            createdAt: new Date(startedAt.getTime() + 31_000),
          },
        });
      }
    }

    if (scenario.outcome) {
      await prismaUnscoped.callOutcome.create({
        data: {
          tenantId: tenant.id,
          callSessionId: session.id,
          value: scenario.outcome.value,
          confidence: scenario.outcome.confidence,
          evidence: scenario.outcome.evidence,
          rationale: scenario.outcome.rationale,
          createdAt: endedAt,
        },
      });
      outcomes++;
    }

    await prismaUnscoped.query.update({ where: { id: query.id }, data: { lastCallId: session.id } });
  }

  return { calls, outcomes };
}
