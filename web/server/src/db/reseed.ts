import { prismaUnscoped } from "./prisma";
import { OrderStatus } from "../generated/prisma";
import { seedOutboundData } from "./seed-outbound";
import { seedDemoCallHistory } from "./seed-demo-calls";
import { seedDemoTickets } from "./seed-demo-tickets";
import { demoContactOverride } from "./demo-contact";

/**
 * Demo seed data (BUILD-PLAN §4): 2 tenants, 6 customers, ~20 festive orders,
 * including the ₹6,800 gift hamper that drives the NudgeBee half of the demo.
 * Shared by `prisma/seed.ts` (CLI) and `POST /api/demo/reset` (route).
 */

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

type SeedOrder = {
  id: string;
  items: { name: string; qty: number; priceInr: number }[];
  amountInr: number;
  status: OrderStatus;
  isFestiveGift?: boolean;
  promisedAt: Date;
  deliveredAt?: Date;
  riderEtaMins?: number;
  refundedInr?: number;
  placedAt: Date;
};

async function truncateAll() {
  // FK-safe order: children before parents.
  await prismaUnscoped.enquiry.deleteMany();
  await prismaUnscoped.widgetInstallation.deleteMany();
  await prismaUnscoped.approval.deleteMany();
  await prismaUnscoped.agentAction.deleteMany();
  await prismaUnscoped.callOutcome.deleteMany();
  await prismaUnscoped.callTurn.deleteMany();
  await prismaUnscoped.callSession.deleteMany();
  await prismaUnscoped.message.deleteMany();
  await prismaUnscoped.ticket.deleteMany();
  await prismaUnscoped.query.deleteMany();
  await prismaUnscoped.product.deleteMany();
  await prismaUnscoped.knowledgeArticle.deleteMany();
  await prismaUnscoped.order.deleteMany();
  await prismaUnscoped.customer.deleteMany();
  await prismaUnscoped.tenant.deleteMany();
}

export async function reseedDemoData(): Promise<{ tenants: number; customers: number; orders: number; tickets: number; products: number; queries: number; articles: number; calls: number; restoredAdmins: number }> {
  await truncateAll();

  const festiveMart = await prismaUnscoped.tenant.create({
    data: { slug: "festive-mart", name: "Festive Mart", brandTone: "warm", adapter: "mock" },
  });

  const sweetCo = await prismaUnscoped.tenant.create({
    data: { slug: "sweet-co", name: "Sweet Co.", brandTone: "warm", adapter: "mock" },
  });

  const festiveMartCustomers = await Promise.all(
    [
      { name: "Priya Sharma", phone: "+91-98100-11122", preferredLang: "hi-IN" },
      { name: "Rohan Mehta", phone: "+91-98200-22233", preferredLang: "en-IN" },
      { name: "Ayesha Khan", phone: "+91-98300-33344", preferredLang: "hi-IN" },
    ].map((c, i) => prismaUnscoped.customer.create({ data: { ...c, ...demoContactOverride(i), tenantId: festiveMart.id } })),
  );

  const sweetCoCustomers = await Promise.all(
    [
      { name: "Kavya Reddy", phone: "+91-98400-44455", preferredLang: "hi-IN" },
      { name: "Arjun Nair", phone: "+91-98500-55566", preferredLang: "en-IN" },
      { name: "Simran Kaur", phone: "+91-98600-66677", preferredLang: "hi-IN" },
    ].map((c, i) => prismaUnscoped.customer.create({ data: { ...c, ...demoContactOverride(i + 3), tenantId: sweetCo.id } })),
  );

  const [priya, rohan, ayesha] = festiveMartCustomers;
  const [kavya, arjun, simran] = sweetCoCustomers;

  // festive-mart orders — includes the ₹6,800 hamper, the demo centerpiece.
  const festiveMartOrders: (SeedOrder & { customerId: string })[] = [
    {
      id: "ORD-1001",
      customerId: priya.id,
      items: [{ name: "Diwali Gift Hamper (Premium)", qty: 1, priceInr: 6800 }],
      amountInr: 6800,
      status: OrderStatus.DELIVERED,
      isFestiveGift: true,
      promisedAt: daysAgo(2),
      deliveredAt: hoursAgo(10), // delivered within 24h — a "problem state" order
      placedAt: daysAgo(4),
    },
    {
      id: "ORD-1002",
      customerId: rohan.id,
      items: [
        { name: "Marigold String Lights", qty: 2, priceInr: 450 },
        { name: "Brass Diya Set (6pc)", qty: 1, priceInr: 550 },
      ],
      amountInr: 1450,
      status: OrderStatus.DELAYED,
      promisedAt: daysAgo(1),
      riderEtaMins: 180,
      placedAt: daysAgo(5),
    },
    {
      id: "ORD-1003",
      customerId: ayesha.id,
      items: [{ name: "Silk Kurta — Maroon, size L", qty: 1, priceInr: 2200 }],
      amountInr: 2200,
      status: OrderStatus.DELIVERED,
      promisedAt: daysAgo(3),
      deliveredAt: hoursAgo(14), // wrong size, delivered the day before a function
      placedAt: daysAgo(6),
    },
    {
      id: "ORD-1004",
      customerId: priya.id,
      items: [{ name: "Rangoli Stencil Set", qty: 3, priceInr: 220 }],
      amountInr: 660,
      status: OrderStatus.DISPATCHED,
      promisedAt: daysAgo(1),
      riderEtaMins: 45,
      placedAt: daysAgo(2),
    },
    {
      id: "ORD-1005",
      customerId: rohan.id,
      items: [{ name: "LED Lantern (Pack of 2)", qty: 1, priceInr: 899 }],
      amountInr: 899,
      status: OrderStatus.PLACED,
      promisedAt: daysAgo(-1),
      placedAt: hoursAgo(6),
    },
    {
      id: "ORD-1006",
      customerId: ayesha.id,
      items: [{ name: "Scented Candle Trio", qty: 2, priceInr: 349 }],
      amountInr: 698,
      status: OrderStatus.CANCELLED,
      promisedAt: daysAgo(3),
      placedAt: daysAgo(5),
    },
    {
      id: "ORD-1007",
      customerId: priya.id,
      items: [{ name: "Diwali Sweet Box — Assorted", qty: 1, priceInr: 799 }],
      amountInr: 799,
      status: OrderStatus.DISPATCHED,
      promisedAt: daysAgo(2),
      riderEtaMins: 240,
      placedAt: daysAgo(4),
    },
    {
      id: "ORD-1008",
      customerId: rohan.id,
      items: [{ name: "Pooja Thali Set", qty: 1, priceInr: 1299 }],
      amountInr: 1299,
      status: OrderStatus.DELIVERED,
      promisedAt: daysAgo(4),
      deliveredAt: daysAgo(4),
      placedAt: daysAgo(6),
    },
    {
      id: "ORD-1009",
      customerId: ayesha.id,
      items: [{ name: "Fairy Lights — Warm White", qty: 4, priceInr: 199 }],
      amountInr: 796,
      status: OrderStatus.DELIVERED,
      promisedAt: daysAgo(5),
      deliveredAt: daysAgo(5),
      placedAt: daysAgo(6),
    },
    {
      id: "ORD-1010",
      customerId: priya.id,
      items: [{ name: "Terracotta Diya Set (12pc)", qty: 1, priceInr: 450 }],
      amountInr: 450,
      status: OrderStatus.PLACED,
      promisedAt: daysAgo(-2),
      placedAt: hoursAgo(2),
    },
  ];

  // sweet-co orders — a sweets/mithai brand, smaller tickets, tighter ceiling.
  const sweetCoOrders: (SeedOrder & { customerId: string })[] = [
    {
      id: "ORD-2001",
      customerId: kavya.id,
      items: [{ name: "Kaju Katli Box (1kg)", qty: 1, priceInr: 1200 }],
      amountInr: 1200,
      status: OrderStatus.DELAYED,
      promisedAt: daysAgo(1),
      riderEtaMins: 120,
      placedAt: daysAgo(3),
    },
    {
      id: "ORD-2002",
      customerId: arjun.id,
      items: [{ name: "Motichoor Ladoo (500g)", qty: 2, priceInr: 350 }],
      amountInr: 700,
      status: OrderStatus.DELIVERED,
      promisedAt: daysAgo(2),
      deliveredAt: hoursAgo(8),
      placedAt: daysAgo(4),
    },
    {
      id: "ORD-2003",
      customerId: simran.id,
      items: [{ name: "Mixed Mithai Hamper", qty: 1, priceInr: 899 }],
      amountInr: 899,
      status: OrderStatus.DISPATCHED,
      promisedAt: daysAgo(1),
      riderEtaMins: 60,
      placedAt: daysAgo(2),
    },
    {
      id: "ORD-2004",
      customerId: kavya.id,
      items: [{ name: "Soan Papdi (1kg)", qty: 1, priceInr: 420 }],
      amountInr: 420,
      status: OrderStatus.DELIVERED,
      promisedAt: daysAgo(3),
      deliveredAt: daysAgo(3),
      placedAt: daysAgo(5),
    },
    {
      id: "ORD-2005",
      customerId: arjun.id,
      items: [{ name: "Dry Fruit Mithai Box", qty: 1, priceInr: 1499 }],
      amountInr: 1499,
      status: OrderStatus.CANCELLED,
      promisedAt: daysAgo(2),
      placedAt: daysAgo(3),
    },
    {
      id: "ORD-2006",
      customerId: simran.id,
      items: [{ name: "Besan Ladoo (500g)", qty: 3, priceInr: 250 }],
      amountInr: 750,
      status: OrderStatus.PLACED,
      promisedAt: daysAgo(-1),
      placedAt: hoursAgo(4),
    },
    {
      id: "ORD-2007",
      customerId: kavya.id,
      items: [{ name: "Gulab Jamun Tin (1kg)", qty: 1, priceInr: 380 }],
      amountInr: 380,
      status: OrderStatus.DELIVERED,
      promisedAt: daysAgo(4),
      deliveredAt: hoursAgo(18),
      placedAt: daysAgo(6),
    },
    {
      id: "ORD-2008",
      customerId: arjun.id,
      items: [{ name: "Festive Namkeen Combo", qty: 2, priceInr: 299 }],
      amountInr: 598,
      status: OrderStatus.DISPATCHED,
      promisedAt: daysAgo(1),
      riderEtaMins: 90,
      placedAt: daysAgo(2),
    },
    {
      id: "ORD-2009",
      customerId: simran.id,
      items: [{ name: "Rasgulla Tin (1kg)", qty: 1, priceInr: 320 }],
      amountInr: 320,
      status: OrderStatus.DELIVERED,
      promisedAt: daysAgo(5),
      deliveredAt: daysAgo(5),
      placedAt: daysAgo(6),
    },
    {
      id: "ORD-2010",
      customerId: kavya.id,
      items: [{ name: "Premium Dry Fruit Box", qty: 1, priceInr: 2100 }],
      amountInr: 2100,
      status: OrderStatus.PLACED,
      promisedAt: daysAgo(-2),
      placedAt: hoursAgo(1),
    },
  ];

  for (const order of [...festiveMartOrders, ...sweetCoOrders]) {
    const tenantId = festiveMartOrders.includes(order) ? festiveMart.id : sweetCo.id;
    await prismaUnscoped.order.create({
      data: { ...order, tenantId, refundedInr: order.refundedInr ?? 0 },
    });
  }

  const outbound = await seedOutboundData();
  const history = await seedDemoCallHistory();
  const support = await seedDemoTickets();
  const restoredAdmins = await restoreDemoAdminMemberships();

  return {
    tenants: 2,
    customers: festiveMartCustomers.length + sweetCoCustomers.length + (support.customer ? 1 : 0),
    orders: festiveMartOrders.length + sweetCoOrders.length + support.orders,
    tickets: support.tickets,
    products: outbound.products,
    queries: outbound.queries + history.calls,
    articles: outbound.articles,
    calls: history.calls,
    restoredAdmins,
  };
}

/**
 * Development-only convenience: a full demo reset deletes tenants, which
 * cascades memberships. If a demo admin has already completed registration,
 * restore their membership so the documented demo login keeps working.
 * Accounts without a password still require the invitation flow.
 */
export async function restoreDemoAdminMemberships(): Promise<number> {
  const tenants = await prismaUnscoped.tenant.findMany({ select: { id: true, slug: true } });
  let restored = 0;
  for (const tenant of tenants) {
    const email = `admin+${tenant.slug}@diya.local`;
    const user = await prismaUnscoped.user.findUnique({ where: { email } });
    if (!user?.passwordHash) continue;
    await prismaUnscoped.membership.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      create: { userId: user.id, tenantId: tenant.id, role: "TENANT_ADMIN" },
      update: { role: "TENANT_ADMIN", status: "ACTIVE", removedAt: null },
    });
    restored++;
  }
  return restored;
}
