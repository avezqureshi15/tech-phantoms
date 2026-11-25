import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../../app";
import { hashPassword } from "../../auth/passwords";
import { prismaUnscoped } from "../../db/prisma";

const RUN = process.env.RUN_ENQUIRY_INTEGRATION === "1";
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const password = "enquiry integration test password";
const trustedOrigin = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173,http://localhost:5174").split(",")[0]!.trim();
const publicOrigin = `https://store-${suffix}.example.test`;

let server: Server | null = null;
let baseUrl = "";
let tenantAId: string | undefined;
let tenantBId: string | undefined;
let adminAId: string | undefined;
let adminBId: string | undefined;
let publicWidgetId = "";

async function api(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Origin", trustedOrigin);
  if (init.cookie) headers.set("Cookie", init.cookie);
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

async function signIn(email: string): Promise<string> {
  const response = await api("/api/auth/sign-in", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  expect(response.status).toBe(200);
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0];
  expect(cookie).toContain("diya_session=");
  return cookie;
}

async function submitEnquiry(input: Record<string, unknown>, origin = publicOrigin) {
  return fetch(`${baseUrl}/api/public/widget/${publicWidgetId}/enquiries`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

describe.skipIf(!RUN)("website enquiry workflow integration", () => {
  beforeAll(async () => {
    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    baseUrl = `http://127.0.0.1:${address.port}`;

    const tenantA = await prismaUnscoped.tenant.create({ data: { slug: `enquiry-a-${suffix}`, name: "Enquiry Store A" } });
    tenantAId = tenantA.id;
    const tenantB = await prismaUnscoped.tenant.create({ data: { slug: `enquiry-b-${suffix}`, name: "Enquiry Store B" } });
    tenantBId = tenantB.id;
    const widget = await prismaUnscoped.widgetInstallation.create({
      data: {
        tenantId: tenantA.id,
        publicId: `diya_it_${suffix}`,
        allowedOrigins: [publicOrigin],
        welcomeText: "Tell our team what you need.",
      },
    });
    publicWidgetId = widget.publicId;

    const passwordHash = await hashPassword(password);
    const adminA = await prismaUnscoped.user.create({
      data: { email: `enquiry-a-${suffix}@test.local`, name: "Enquiry Admin A", passwordHash },
    });
    adminAId = adminA.id;
    const adminB = await prismaUnscoped.user.create({
      data: { email: `enquiry-b-${suffix}@test.local`, name: "Enquiry Admin B", passwordHash },
    });
    adminBId = adminB.id;
    await prismaUnscoped.membership.createMany({
      data: [
        { userId: adminA.id, tenantId: tenantA.id, role: "TENANT_ADMIN" },
        { userId: adminB.id, tenantId: tenantB.id, role: "TENANT_ADMIN" },
      ],
    });
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId].filter((id): id is string => Boolean(id));
    const userIds = [adminAId, adminBId].filter((id): id is string => Boolean(id));
    if (tenantIds.length > 0) {
      await prismaUnscoped.enquiry.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prismaUnscoped.widgetInstallation.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prismaUnscoped.auditEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prismaUnscoped.membership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    }
    if (userIds.length > 0) {
      await prismaUnscoped.session.deleteMany({ where: { userId: { in: userIds } } });
      await prismaUnscoped.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (tenantIds.length > 0) await prismaUnscoped.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()) ?? resolve());
  });

  it("loads the real hosted widget script and serves only the allowed public config", async () => {
    const script = await fetch(`${baseUrl}/widget.js`);
    expect(script.status).toBe(200);
    expect(script.headers.get("content-type")).toContain("javascript");
    expect(await script.text()).toContain("attachShadow");

    const config = await fetch(`${baseUrl}/api/public/widget/${publicWidgetId}`, {
      headers: { Origin: publicOrigin },
    });
    expect(config.status).toBe(200);
    expect(config.headers.get("access-control-allow-origin")).toBe(publicOrigin);
    expect(await config.json()).toEqual({
      brandName: "Enquiry Store A",
      accentColor: "#B7503C",
      welcomeText: "Tell our team what you need.",
    });
  });

  it("persists one enquiry across retries and exposes it only to its tenant inbox", async () => {
    const submission = {
      submissionId: `submission-${suffix}`,
      name: "Asha Rao",
      email: "asha@example.com",
      phone: "",
      message: "Do you have the brass diya set in a larger size?",
      contactConsent: true,
      pageUrl: `${publicOrigin}/products/brass-diya`,
      pageTitle: "Brass Diya Set",
      productName: "Hand-beaten Brass Diyas",
    };

    const first = await submitEnquiry(submission);
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ accepted: true });
    const retry = await submitEnquiry(submission);
    expect(retry.status).toBe(202);

    const phoneSubmission = await submitEnquiry({
      submissionId: `phone-${suffix}`,
      name: "Rohan Mehta",
      email: "",
      phone: "+91 98765 43210",
      message: "Can I collect the gift box from your store?",
      contactConsent: true,
    });
    expect(phoneSubmission.status).toBe(202);

    const persisted = await prismaUnscoped.enquiry.findMany({ where: { tenantId: tenantAId } });
    expect(persisted).toHaveLength(2);
    const emailEnquiry = persisted.find((enquiry) => enquiry.submissionId === submission.submissionId);
    const phoneEnquiry = persisted.find((enquiry) => enquiry.submissionId === `phone-${suffix}`);
    expect(emailEnquiry).toMatchObject({
      name: "Asha Rao",
      email: "asha@example.com",
      phone: null,
      message: submission.message,
      productName: "Hand-beaten Brass Diyas",
      status: "NEW",
    });
    expect(emailEnquiry?.contactConsentAt).toBeInstanceOf(Date);
    expect(phoneEnquiry).toMatchObject({ name: "Rohan Mehta", email: null, phone: "+91 98765 43210" });

    const adminACookie = await signIn(`enquiry-a-${suffix}@test.local`);
    const settingsResponse = await api("/api/tenant/widget", { cookie: adminACookie });
    expect(settingsResponse.status).toBe(200);
    expect(((await settingsResponse.json()) as { widget: { publicId: string } }).widget.publicId).toBe(publicWidgetId);

    const updateSettings = await api("/api/tenant/widget", {
      method: "PUT",
      cookie: adminACookie,
      body: JSON.stringify({
        enabled: true,
        allowedOrigins: [publicOrigin],
        accentColor: "#6A3542",
        welcomeText: "A new welcome from the store.",
      }),
    });
    expect(updateSettings.status).toBe(200);
    const updatedConfig = await fetch(`${baseUrl}/api/public/widget/${publicWidgetId}`, {
      headers: { Origin: publicOrigin },
    });
    expect(await updatedConfig.json()).toMatchObject({ accentColor: "#6A3542", welcomeText: "A new welcome from the store." });

    const inboxA = await api("/api/enquiries", { cookie: adminACookie });
    expect(inboxA.status).toBe(200);
    const inboxAData = await inboxA.json() as { enquiries: Array<{ id: string; status: string }> };
    expect(inboxAData.enquiries).toHaveLength(2);
    expect(inboxAData.enquiries.map((enquiry) => enquiry.id)).toContain(emailEnquiry?.id);
    const recent = await api("/api/enquiries?limit=1", { cookie: adminACookie });
    expect((await recent.json() as { enquiries: unknown[] }).enquiries).toHaveLength(1);

    const adminBCookie = await signIn(`enquiry-b-${suffix}@test.local`);
    const inboxB = await api("/api/enquiries", { cookie: adminBCookie });
    expect(inboxB.status).toBe(200);
    expect((await inboxB.json() as { enquiries: unknown[] }).enquiries).toEqual([]);
    expect((await api(`/api/enquiries/${emailEnquiry!.id}`, {
      method: "PATCH",
      cookie: adminBCookie,
      body: JSON.stringify({ status: "CLOSED" }),
    })).status).toBe(404);

    const reviewed = await api(`/api/enquiries/${emailEnquiry!.id}`, {
      method: "PATCH",
      cookie: adminACookie,
      body: JSON.stringify({ status: "REVIEWED" }),
    });
    expect(reviewed.status).toBe(200);
    expect(((await reviewed.json()) as { enquiry: { status: string } }).enquiry.status).toBe("REVIEWED");
    expect((await prismaUnscoped.enquiry.findUnique({ where: { id: emailEnquiry!.id } }))?.status).toBe("REVIEWED");
  });

  it("rejects unconfigured origins, missing reply consent, and unauthenticated inbox access", async () => {
    const submission = {
      submissionId: `invalid-${suffix}`,
      name: "Asha Rao",
      email: "asha@example.com",
      message: "Please tell me about delivery.",
      contactConsent: true,
    };
    expect((await submitEnquiry(submission, "https://not-configured.example.test")).status).toBe(403);
    expect((await submitEnquiry({ ...submission, submissionId: `no-consent-${suffix}`, contactConsent: false })).status).toBe(400);
    expect((await submitEnquiry({
      ...submission,
      submissionId: `no-contact-${suffix}`,
      email: "",
      phone: "",
    })).status).toBe(400);
    expect((await api("/api/enquiries")).status).toBe(401);
    expect(await prismaUnscoped.enquiry.count({ where: { tenantId: tenantAId } })).toBe(2);
  });
});
