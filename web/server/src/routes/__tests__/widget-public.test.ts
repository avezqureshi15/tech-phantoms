import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findWidget: vi.fn(),
  saveEnquiry: vi.fn(),
}));

vi.mock("../../db/prisma", () => ({
  prisma: { enquiry: { upsert: db.saveEnquiry } },
  prismaUnscoped: { widgetInstallation: { findUnique: db.findWidget } },
}));

import { publicWidgetRouter } from "../widget-public";

const installation = {
  id: "widget-1",
  tenantId: "tenant-1",
  publicId: "diya_test_widget_123",
  enabled: true,
  allowedOrigins: ["https://shop.example.com"],
  accentColor: "#B7503C",
  welcomeText: "Tell us what you need.",
  tenant: { id: "tenant-1", name: "Festive House", status: "ACTIVE" },
};

describe("public widget routes", () => {
  let server: ReturnType<ReturnType<typeof express>['listen']>;

  beforeEach(async () => {
    db.findWidget.mockResolvedValue(installation);
    db.saveEnquiry.mockResolvedValue({ id: "enquiry-1" });
    const app = express();
    app.use(express.json());
    app.use("/api/public/widget", publicWidgetRouter);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    vi.clearAllMocks();
  });

  function url(path: string) {
    const address = server.address() as AddressInfo;
    return `http://127.0.0.1:${address.port}${path}`;
  }

  it("serves only safe widget configuration to an allowed origin", async () => {
    const response = await fetch(url(`/api/public/widget/${installation.publicId}`), {
      headers: { Origin: "https://shop.example.com" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://shop.example.com");
    expect(await response.json()).toEqual({
      brandName: "Festive House",
      accentColor: "#B7503C",
      welcomeText: "Tell us what you need.",
    });
  });

  it("rejects an origin outside the installation allowlist", async () => {
    const response = await fetch(url(`/api/public/widget/${installation.publicId}`), {
      headers: { Origin: "https://elsewhere.example" },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("creates a tenant-bound enquiry and captures reply consent", async () => {
    const response = await fetch(url(`/api/public/widget/${installation.publicId}/enquiries`), {
      method: "POST",
      headers: { Origin: "https://shop.example.com", "Content-Type": "application/json" },
      body: JSON.stringify({
        submissionId: "submission-0001",
        name: "Asha Rao",
        email: "asha@example.com",
        phone: "",
        message: "Do you have the brass diya set in a larger size?",
        contactConsent: true,
        pageUrl: "https://shop.example.com/products/brass-diya",
        pageTitle: "Brass Diya Set",
        productName: "Hand-beaten Brass Diyas",
      }),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
    expect(db.saveEnquiry).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: "tenant-1" }),
      create: expect.objectContaining({
        tenantId: "tenant-1",
        widgetInstallationId: "widget-1",
        name: "Asha Rao",
        email: "asha@example.com",
        productName: "Hand-beaten Brass Diyas",
        contactConsentAt: expect.any(Date),
      }),
    }));
  });

  it("handles an allowed preflight without cookies", async () => {
    const response = await fetch(url(`/api/public/widget/${installation.publicId}/enquiries`), {
      method: "OPTIONS",
      headers: {
        Origin: "https://shop.example.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
  });
});
