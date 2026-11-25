import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../../app";
import { prismaUnscoped } from "../../db/prisma";
import { hashPassword } from "../../auth/passwords";

const RUN = process.env.RUN_AUTH_INTEGRATION === "1";

interface Fixture {
  tenantA: string;
  tenantB: string;
  adminA: string;
  adminB: string;
  operatorA: string;
  multi: string;
  queryA: string;
  callA: string;
  articleA: string;
}

let server: Server | null = null;
let baseUrl = "";
let fixture: Fixture;
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = "correct horse battery";
const cookieFor = (email: string) => signIn(email);

async function body(res: Response) {
  return res.json().catch(() => null) as Promise<Record<string, unknown> | null>;
}

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  expect(res.status).toBe(200);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const session = setCookie.split(";")[0];
  expect(session).toContain("diya_session=");
  return session;
}

async function api(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (init.cookie) headers.set("cookie", init.cookie);
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

describe.skipIf(!RUN)("auth + tenant isolation integration", () => {
  beforeAll(async () => {
    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    baseUrl = `http://127.0.0.1:${address.port}`;

    const tenantA = await prismaUnscoped.tenant.create({ data: { slug: `iso-a-${suffix}`, name: "Iso A" } });
    const tenantB = await prismaUnscoped.tenant.create({ data: { slug: `iso-b-${suffix}`, name: "Iso B" } });
    const passwordHash = await hashPassword(PASSWORD);
    const adminA = await prismaUnscoped.user.create({ data: { email: `admin-a-${suffix}@test.local`, name: "Admin A", passwordHash } });
    const adminB = await prismaUnscoped.user.create({ data: { email: `admin-b-${suffix}@test.local`, name: "Admin B", passwordHash } });
    const operatorA = await prismaUnscoped.user.create({ data: { email: `operator-a-${suffix}@test.local`, name: "Operator A", passwordHash } });
    const multi = await prismaUnscoped.user.create({ data: { email: `multi-${suffix}@test.local`, name: "Multi User", passwordHash } });
    await prismaUnscoped.membership.createMany({
      data: [
        { userId: adminA.id, tenantId: tenantA.id, role: "TENANT_ADMIN" },
        { userId: adminB.id, tenantId: tenantB.id, role: "TENANT_ADMIN" },
        { userId: operatorA.id, tenantId: tenantA.id, role: "OPERATOR" },
        { userId: multi.id, tenantId: tenantA.id, role: "OPERATOR" },
        { userId: multi.id, tenantId: tenantB.id, role: "TENANT_ADMIN" },
      ],
    });
    const customer = await prismaUnscoped.customer.create({
      data: { tenantId: tenantA.id, name: "Iso Customer", phone: "+919999999999" },
    });
    const query = await prismaUnscoped.query.create({
      data: {
        tenantId: tenantA.id,
        customerId: customer.id,
        issueSummary: "Isolation fixture query",
        category: "sweets",
        status: "NEW",
      },
    });
    const ticket = await prismaUnscoped.ticket.create({
      data: { tenantId: tenantA.id, customerId: customer.id, channel: "VOICE", language: "hi-IN", status: "OPEN" },
    });
    const call = await prismaUnscoped.callSession.create({
      data: { tenantId: tenantA.id, queryId: query.id, ticketId: ticket.id, channel: "TWILIO", toNumber: "+919999999999", fromNumber: "+918888888888" },
    });
    const article = await prismaUnscoped.knowledgeArticle.create({
      data: { tenantId: tenantA.id, title: "A-only article", category: "sweets", tags: ["deri"], body: "Tenant A article body." },
    });
    fixture = {
      tenantA: tenantA.id,
      tenantB: tenantB.id,
      adminA: adminA.id,
      adminB: adminB.id,
      operatorA: operatorA.id,
      multi: multi.id,
      queryA: query.id,
      callA: call.id,
      articleA: article.id,
    };
  });

  afterAll(async () => {
    if (fixture) {
      const userIds = [fixture.adminA, fixture.adminB, fixture.operatorA, fixture.multi];
      const tenantIds = [fixture.tenantA, fixture.tenantB];
      await prismaUnscoped.session.deleteMany({ where: { userId: { in: userIds } } });
      await prismaUnscoped.membership.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prismaUnscoped.invitation.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prismaUnscoped.auditEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prismaUnscoped.callOutcome.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prismaUnscoped.callTurn.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prismaUnscoped.callSession.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prismaUnscoped.agentAction.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prismaUnscoped.approval.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prismaUnscoped.message.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prismaUnscoped.ticket.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prismaUnscoped.query.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prismaUnscoped.knowledgeArticle.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prismaUnscoped.customer.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prismaUnscoped.user.deleteMany({ where: { id: { in: userIds } } });
      await prismaUnscoped.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
    await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()) ?? resolve());
  });

  it("rejects unauthenticated access", async () => {
    const res = await api("/api/queries");
    expect(res.status).toBe(401);
  });

  it("returns only the caller's memberships", async () => {
    const cookie = await cookieFor(`admin-b-${suffix}@test.local`);
    const me = await api("/api/auth/me", { cookie });
    const data = await body(me) as { memberships: Array<{ tenantId: string }> };
    expect(data.memberships.map((m) => m.tenantId)).toEqual([fixture.tenantB]);

    const tenants = await api("/api/console/tenants", { cookie });
    const tenantData = await body(tenants) as { tenants: Array<{ slug: string }> };
    expect(tenantData.tenants).toHaveLength(1);
    expect(tenantData.tenants[0]?.slug).toContain("iso-b-");
  });

  it("hides another tenant's call, query consent and do-not-call writes", async () => {
    const cookie = await cookieFor(`admin-b-${suffix}@test.local`);
    expect((await api(`/api/calls/${fixture.callA}`, { cookie })).status).toBe(404);
    expect((await api(`/api/queries/${fixture.queryA}`, { cookie })).status).toBe(404);
    expect((await api(`/api/queries/${fixture.queryA}/consent`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ confirmed: true, source: "should-not-work" }),
    })).status).toBe(404);
    expect((await api(`/api/queries/${fixture.queryA}/do-not-call`, {
      method: "PATCH",
      cookie,
      body: JSON.stringify({ doNotCall: true }),
    })).status).toBe(404);
    expect((await api(`/api/knowledge/${fixture.articleA}`, {
      method: "PATCH",
      cookie,
      body: JSON.stringify({ title: "hijacked", category: "general", tags: ["deri"], body: "hijacked body text" }),
    })).status).toBe(404);
  });

  it("enforces tenant and platform roles", async () => {
    const operator = await cookieFor(`operator-a-${suffix}@test.local`);
    expect((await api("/api/tenant/invitations", {
      method: "POST",
      cookie: operator,
      body: JSON.stringify({ email: "x@test.local", role: "OPERATOR" }),
    })).status).toBe(403);
    expect((await api("/api/tenant/members", { cookie: operator })).status).toBe(403);

    const adminB = await cookieFor(`admin-b-${suffix}@test.local`);
    expect((await api("/api/platform/tenants", { cookie: adminB })).status).toBe(403);
  });

  it("blocks self-removal and self-demotion", async () => {
    const cookie = await cookieFor(`admin-a-${suffix}@test.local`);
    expect((await api(`/api/tenant/members/${fixture.adminA}`, { method: "DELETE", cookie })).status).toBe(400);
    expect((await api(`/api/tenant/members/${fixture.adminA}`, {
      method: "PATCH",
      cookie,
      body: JSON.stringify({ role: "OPERATOR" }),
    })).status).toBe(400);
  });

  it("invalidates sessions on sign-out-all", async () => {
    const cookie = await cookieFor(`admin-a-${suffix}@test.local`);
    expect((await api("/api/auth/me", { cookie })).status).toBe(200);
    expect((await api("/api/auth/sign-out-all", { method: "POST", cookie })).status).toBe(200);
    expect((await api("/api/auth/me", { cookie })).status).toBe(401);
  });

  it("switches workspaces with per-tenant roles and immediate role changes", async () => {
    const cookie = await cookieFor(`multi-${suffix}@test.local`);
    const me = await api("/api/auth/me", { cookie });
    expect(((await body(me)) as { activeTenant: unknown }).activeTenant).toBeNull();

    const blocked = await api("/api/queries", { cookie });
    expect(blocked.status).toBe(409);
    expect(((await body(blocked)) as { code?: string }).code).toBe("NO_ACTIVE_TENANT");

    expect((await api("/api/auth/switch-tenant", {
      method: "POST",
      cookie,
      body: JSON.stringify({ tenantSlug: `iso-a-${suffix}` }),
    })).status).toBe(200);
    expect((await api("/api/queries", { cookie })).status).toBe(200);
    expect((await api("/api/tenant/members", { cookie })).status).toBe(403);

    const adminCookie = await cookieFor(`admin-a-${suffix}@test.local`);
    expect((await api(`/api/tenant/members/${fixture.multi}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ role: "TENANT_ADMIN" }),
    })).status).toBe(200);
    expect((await api("/api/tenant/members", { cookie })).status).toBe(200);

    expect((await api("/api/auth/switch-tenant", {
      method: "POST",
      cookie,
      body: JSON.stringify({ tenantSlug: `iso-b-${suffix}` }),
    })).status).toBe(200);
    expect((await api("/api/tenant/members", { cookie })).status).toBe(200);

    expect((await api(`/api/tenant/members/${fixture.multi}`, { method: "DELETE", cookie: adminCookie })).status).toBe(204);
    expect((await api("/api/auth/switch-tenant", {
      method: "POST",
      cookie,
      body: JSON.stringify({ tenantSlug: `iso-a-${suffix}` }),
    })).status).toBe(403);
    expect((await api("/api/auth/switch-tenant", {
      method: "POST",
      cookie,
      body: JSON.stringify({ tenantSlug: `iso-b-${suffix}` }),
    })).status).toBe(200);
  });

  it("binds the invited role and email, and rejects a replayed token", async () => {
    const adminCookie = await cookieFor(`admin-a-${suffix}@test.local`);
    const inviteeEmail = `invitee-${suffix}@test.local`;
    const created = await api("/api/tenant/invitations", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ email: inviteeEmail, role: "OPERATOR" }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await body(created)) as { inviteLink: string };
    const token = createdBody.inviteLink.split("/").pop();
    expect(token).toBeTruthy();

    const preview = await api(`/api/auth/invite/${encodeURIComponent(token!)}`);
    expect(preview.status).toBe(200);
    expect(((await body(preview)) as { role: string }).role).toBe("OPERATOR");

    const accepted = await api("/api/auth/accept-invite", {
      method: "POST",
      body: JSON.stringify({ token, name: "Invitee", password: PASSWORD, role: "TENANT_ADMIN", platformRole: "SUPER_ADMIN" }),
    });
    expect(accepted.status).toBe(200);

    const inviteeUser = await prismaUnscoped.user.findUnique({ where: { email: inviteeEmail } });
    expect(inviteeUser).not.toBeNull();
    expect(inviteeUser?.platformRole).toBe("NONE");
    const membership = await prismaUnscoped.membership.findFirst({
      where: { userId: inviteeUser!.id, tenantId: fixture.tenantA },
    });
    expect(membership?.role).toBe("OPERATOR");

    const replay = await api("/api/auth/accept-invite", {
      method: "POST",
      body: JSON.stringify({ token, name: "Invitee", password: PASSWORD }),
    });
    expect(replay.status).toBe(404);

    await prismaUnscoped.session.deleteMany({ where: { userId: inviteeUser!.id } });
    await prismaUnscoped.membership.deleteMany({ where: { userId: inviteeUser!.id } });
    await prismaUnscoped.user.delete({ where: { id: inviteeUser!.id } });
  });

  it("adds a second membership to an existing account without touching its password", async () => {
    const adminBEmail = `admin-b-${suffix}@test.local`;
    const adminAEmail = `admin-a-${suffix}@test.local`;
    const adminBCookie = await cookieFor(adminBEmail);
    const created = await api("/api/tenant/invitations", {
      method: "POST",
      cookie: adminBCookie,
      body: JSON.stringify({ email: adminAEmail, role: "OPERATOR" }),
    });
    expect(created.status).toBe(201);
    const token = ((await body(created)) as { inviteLink: string }).inviteLink.split("/").pop();
    expect(token).toBeTruthy();

    const adminACookie = await cookieFor(adminAEmail);
    const accepted = await api("/api/auth/accept-invite", {
      method: "POST",
      cookie: adminACookie,
      body: JSON.stringify({ token }),
    });
    expect(accepted.status).toBe(200);

    const membership = await prismaUnscoped.membership.findFirst({
      where: { userId: fixture.adminA, tenantId: fixture.tenantB },
    });
    expect(membership?.role).toBe("OPERATOR");

    const signInAgain = await fetch(`${baseUrl}/api/auth/sign-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminAEmail, password: PASSWORD }),
    });
    expect(signInAgain.status).toBe(200);
  });
});
