import { prismaUnscoped } from "./prisma";
import type { Channel, Decision, Prisma, Role, TicketStatus } from "../generated/prisma";
import { demoContactOverride } from "./demo-contact";

/**
 * A dedicated demo customer on the operator's own verified number, with a
 * spread of support tickets so the Overview metrics, the ticket feed and the
 * ticket detail page all have real content.
 *
 * The phone number comes from DEMO_VERIFIED_NUMBERS via `demoContactOverride`;
 * the literal below is a fictional placeholder used only when that is unset.
 */

const PLACEHOLDER_PHONE = "+91-98700-77788";

/** Flagsmith defaults (FLAG_DEFAULTS in src/flags/keys.ts) at decision time. */
const FLAG_SNAPSHOT = {
  ai_agent_enabled: true,
  auto_refund_limit_inr: 2000,
  human_approval_above_inr: 5000,
  festive_surge_mode: false,
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function minutesAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 1000);
}

interface MessageSeed {
  role: Role;
  text: string;
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

interface TicketSeed {
  key: string;
  orderId: string;
  channel: Channel;
  language: string;
  status: TicketStatus;
  resolutionType?: string;
  issueCluster: string;
  openedMinutesAgo: number;
  handleSeconds: number | null;
  messages: MessageSeed[];
  action?: ActionSeed;
}

const ORDERS = [
  {
    id: "ORD-1101",
    items: [{ name: "Brass Pooja Bell Set", qty: 1, priceInr: 1250 }],
    amountInr: 1250,
    status: "DELIVERED" as const,
    promisedMinutes: 3 * 24 * 60,
    deliveredMinutes: 2 * 24 * 60,
  },
  {
    id: "ORD-1102",
    items: [{ name: "Designer Toran and Bandhanwar", qty: 2, priceInr: 1800 }],
    amountInr: 3600,
    status: "DELAYED" as const,
    promisedMinutes: 20 * 60,
    deliveredMinutes: null,
  },
  {
    id: "ORD-1103",
    items: [{ name: "Festive Dry Fruit Tray", qty: 1, priceInr: 4200 }],
    amountInr: 4200,
    status: "DELIVERED" as const,
    promisedMinutes: 4 * 24 * 60,
    deliveredMinutes: 3 * 24 * 60,
  },
];

const TICKETS: TicketSeed[] = [
  {
    key: "toran-late",
    orderId: "ORD-1102",
    channel: "VOICE",
    language: "hi-IN",
    status: "AUTO_RESOLVED",
    resolutionType: "INFO",
    issueCluster: "late_delivery",
    openedMinutesAgo: 310,
    handleSeconds: 42,
    messages: [
      { role: "CUSTOMER", text: "Mera toran order abhi tak nahi aaya. Kal ghar par function hai, kab tak pahunchega?" },
      { role: "AGENT", text: "Main abhi aapka order dekh rahi hoon, ek second." },
      { role: "AGENT", text: "Aapka order ORD-1102 raaste mein hai aur rider lagbhag 3 ghante mein pahunchega. Deri ke liye maaf kijiye." },
      { role: "CUSTOMER", text: "Theek hai, kal subah tak mil jaye bas." },
    ],
    action: {
      tool: "get_order_status",
      args: { orderId: "ORD-1102" },
      policyDecision: "ALLOW",
      executed: true,
      result: { ok: true, status: "DELAYED", riderEtaMins: 180 },
    },
  },
  {
    key: "bell-missing",
    orderId: "ORD-1101",
    channel: "VOICE",
    language: "hi-IN",
    status: "AUTO_RESOLVED",
    resolutionType: "REFUND",
    issueCluster: "missing_item",
    openedMinutesAgo: 240,
    handleSeconds: 68,
    messages: [
      { role: "CUSTOMER", text: "Pooja bell set mein ek chhoti ghanti kam hai, dabbe mein nahi mili." },
      { role: "AGENT", text: "Maaf kijiye. Packing record check karke main missing item ka refund laga deti hoon." },
      { role: "AGENT", text: "Maine 450 rupaye ka refund process kar diya hai, 3 se 5 working days mein aa jayega." },
      { role: "CUSTOMER", text: "Haan theek hai, dhanyavaad." },
    ],
    action: {
      tool: "issue_refund",
      args: { orderId: "ORD-1101", amountInr: 450, reason: "Missing bell from the set" },
      policyDecision: "ALLOW",
      executed: true,
      result: { ok: true, refundId: "demo-refund-1101" },
    },
  },
  {
    key: "tray-damaged",
    orderId: "ORD-1103",
    channel: "CHAT",
    language: "en-IN",
    status: "AWAITING_APPROVAL",
    issueCluster: "damaged_item",
    openedMinutesAgo: 95,
    handleSeconds: null,
    messages: [
      { role: "CUSTOMER", text: "The dry fruit tray arrived crushed and the packaging was torn open. I want a refund." },
      { role: "AGENT", text: "I am sorry about that. Could you confirm how much of the tray is unusable?" },
      { role: "CUSTOMER", text: "Almost all of it, maybe 3200 rupees worth. It was meant as a gift." },
      { role: "AGENT", text: "Understood. A refund of this size needs approval from our team — I have raised it and someone will confirm shortly." },
    ],
    action: {
      tool: "issue_refund",
      args: { orderId: "ORD-1103", amountInr: 3200, reason: "Tray crushed in transit" },
      policyDecision: "REQUIRE_HUMAN",
      denyReason: "refund above the ₹2000 auto-approval limit",
      executed: false,
      pendingApproval: true,
    },
  },
  {
    key: "quality-complaint",
    orderId: "ORD-1103",
    channel: "VOICE",
    language: "hi-IN",
    status: "ESCALATED",
    resolutionType: "HUMAN",
    issueCluster: "quality",
    openedMinutesAgo: 1450,
    handleSeconds: 95,
    messages: [
      { role: "CUSTOMER", text: "Yeh teesri baar hai ki order kharab aaya hai. Main bahut naraz hoon, mujhe manager se baat karni hai." },
      { role: "AGENT", text: "Mujhe bahut khed hai. Main is shikayat ko turant hamari team ke paas bhej rahi hoon." },
      { role: "SYSTEM", text: "Escalated to the human support queue — repeat quality complaint." },
    ],
  },
  {
    key: "exchange-question",
    orderId: "ORD-1101",
    channel: "CHAT",
    language: "en-IN",
    status: "OPEN",
    issueCluster: "replacement",
    openedMinutesAgo: 35,
    handleSeconds: null,
    messages: [
      { role: "CUSTOMER", text: "If I want to exchange the bell set for a larger one, how long do I have?" },
      { role: "AGENT", text: "Unused items can be exchanged within the return window. Would you like me to check availability of the larger set?" },
    ],
  },
  {
    key: "delivery-window",
    orderId: "ORD-1103",
    channel: "VOICE",
    language: "hi-IN",
    status: "CLOSED",
    resolutionType: "INFO",
    issueCluster: "late_delivery",
    openedMinutesAgo: 2900,
    handleSeconds: 38,
    messages: [
      { role: "CUSTOMER", text: "Tyohar ke time delivery kitne baje tak hoti hai?" },
      { role: "AGENT", text: "Tyohar ke dinon mein hum subah 8 baje se raat 9 baje tak delivery karte hain." },
      { role: "CUSTOMER", text: "Samajh gaya, dhanyavaad." },
    ],
  },
];

export async function seedDemoTickets(): Promise<{ customer: string | null; orders: number; tickets: number }> {
  const tenant = await prismaUnscoped.tenant.findUnique({ where: { slug: "festive-mart" } });
  if (!tenant) return { customer: null, orders: 0, tickets: 0 };

  const customer = await prismaUnscoped.customer.create({
    data: {
      tenantId: tenant.id,
      name: "Meera Iyer",
      phone: PLACEHOLDER_PHONE,
      preferredLang: "hi-IN",
      ...demoContactOverride(0),
    },
  });

  for (const order of ORDERS) {
    await prismaUnscoped.order.create({
      data: {
        id: order.id,
        tenantId: tenant.id,
        customerId: customer.id,
        items: toJson(order.items),
        amountInr: order.amountInr,
        status: order.status,
        promisedAt: minutesAgo(order.promisedMinutes),
        deliveredAt: order.deliveredMinutes === null ? null : minutesAgo(order.deliveredMinutes),
        riderEtaMins: order.status === "DELAYED" ? 180 : null,
        placedAt: minutesAgo(order.promisedMinutes + 2 * 24 * 60),
      },
    });
  }

  let ticketCount = 0;
  for (const seed of TICKETS) {
    const openedAt = minutesAgo(seed.openedMinutesAgo);
    const resolvedAt = seed.handleSeconds === null
      ? null
      : new Date(openedAt.getTime() + seed.handleSeconds * 1000);

    const ticket = await prismaUnscoped.ticket.create({
      data: {
        tenantId: tenant.id,
        customerId: customer.id,
        orderId: seed.orderId,
        channel: seed.channel,
        language: seed.language,
        status: seed.status,
        resolutionType: seed.resolutionType,
        issueCluster: seed.issueCluster,
        openedAt,
        resolvedAt,
      },
    });
    ticketCount++;

    for (const [index, message] of seed.messages.entries()) {
      await prismaUnscoped.message.create({
        data: {
          tenantId: tenant.id,
          ticketId: ticket.id,
          role: message.role,
          text: message.text,
          lang: seed.language,
          latencyMs: message.role === "AGENT" ? 2100 + index * 160 : null,
          createdAt: new Date(openedAt.getTime() + index * 9_000),
        },
      });
    }

    if (seed.action) {
      const agentAction = await prismaUnscoped.agentAction.create({
        data: {
          tenantId: tenant.id,
          ticketId: ticket.id,
          tool: seed.action.tool,
          args: toJson(seed.action.args),
          policyDecision: seed.action.policyDecision,
          denyReason: seed.action.denyReason,
          flagSnapshot: toJson(FLAG_SNAPSHOT),
          executed: seed.action.executed,
          result: seed.action.result ? toJson(seed.action.result) : undefined,
          createdAt: new Date(openedAt.getTime() + 20_000),
        },
      });

      if (seed.action.pendingApproval) {
        await prismaUnscoped.approval.create({
          data: {
            tenantId: tenant.id,
            ticketId: ticket.id,
            agentActionId: agentAction.id,
            status: "PENDING",
            createdAt: new Date(openedAt.getTime() + 21_000),
          },
        });
      }
    }
  }

  return { customer: customer.name, orders: ORDERS.length, tickets: ticketCount };
}
