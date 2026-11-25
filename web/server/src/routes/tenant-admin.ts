import { Router } from "express";
import type { TenantRole } from "../generated/prisma";
import { prisma } from "../db/prisma";
import { createInvitation, deliverInvitation } from "../auth/invites";
import { recordAudit } from "../auth/audit";
import { clearTenantFromSessions } from "../auth/sessions";
import { rejectViewAsMutation } from "../auth/middleware";
import { randomBytes } from "node:crypto";
import { parseAllowedOrigins, isHexColor } from "./widget-validation";

export const tenantAdminRouter = Router();

const ROLES: TenantRole[] = ["TENANT_ADMIN", "OPERATOR"];

tenantAdminRouter.get("/widget", async (req, res) => {
  const widget = await prisma.widgetInstallation.findUnique({ where: { tenantId: req.auth!.tenant!.id } });
  res.json({ widget });
});

tenantAdminRouter.put("/widget", rejectViewAsMutation, async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const allowedOrigins = parseAllowedOrigins(body.allowedOrigins);
  const enabled = typeof body.enabled === "boolean" ? body.enabled : true;
  const accentColor = typeof body.accentColor === "string" ? body.accentColor.trim() : "#B7503C";
  const welcomeText = typeof body.welcomeText === "string" ? body.welcomeText.trim() : "Have a question? Send us a note.";

  if (!allowedOrigins || (enabled && allowedOrigins.length === 0)) {
    res.status(400).json({ error: "Add at least one valid website origin before enabling the widget" });
    return;
  }
  if (process.env.NODE_ENV === "production" && allowedOrigins.some((origin) => !origin.startsWith("https://"))) {
    res.status(400).json({ error: "Production widget origins must use HTTPS" });
    return;
  }
  if (!isHexColor(accentColor)) {
    res.status(400).json({ error: "Accent color must be a six-digit hex color" });
    return;
  }
  if (welcomeText.length < 4 || welcomeText.length > 100) {
    res.status(400).json({ error: "Welcome text must be between 4 and 100 characters" });
    return;
  }

  const tenantId = req.auth!.tenant!.id;
  const widget = await prisma.widgetInstallation.upsert({
    where: { tenantId },
    create: {
      tenantId,
      publicId: `diya_${randomBytes(18).toString("base64url")}`,
      enabled,
      allowedOrigins,
      accentColor,
      welcomeText,
    },
    update: { enabled, allowedOrigins, accentColor, welcomeText },
  });
  await recordAudit({
    actorUserId: req.auth!.user.id,
    tenantId,
    action: "widget.configure",
    targetType: "WidgetInstallation",
    targetId: widget.id,
    metadata: { enabled, allowedOrigins },
    ip: req.ip,
  });
  res.json({ widget });
});

function roleFrom(body: unknown): TenantRole | null {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>).role : undefined;
  return typeof value === "string" && ROLES.includes(value as TenantRole) ? (value as TenantRole) : null;
}

function emailFrom(body: unknown): string {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>).email : undefined;
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

tenantAdminRouter.get("/members", async (req, res) => {
  const tenantId = req.auth!.tenant!.id;
  const [members, invitations] = await Promise.all([
    prisma.membership.findMany({
      where: { tenantId, status: "ACTIVE" },
      include: { user: { select: { id: true, name: true, email: true, status: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({
      where: { tenantId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  res.json({
    members: members.map((member) => ({
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      status: member.user.status,
      role: member.role,
      joinedAt: member.createdAt,
    })),
    invitations: invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    })),
  });
});

tenantAdminRouter.post("/invitations", async (req, res) => {
  const email = emailFrom(req.body);
  const role = roleFrom(req.body) ?? "OPERATOR";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "A valid email address is required" });
    return;
  }
  const tenant = req.auth!.tenant!;
  const { invitation, link } = await createInvitation({
    email,
    tenantId: tenant.id,
    role,
    platformRole: null,
    invitedById: req.auth!.user.id,
  });
  await deliverInvitation({ email, link, tenantName: tenant.name, role });
  await recordAudit({
    actorUserId: req.auth!.user.id,
    tenantId: tenant.id,
    action: "member.invite",
    targetType: "Invitation",
    targetId: invitation.id,
    metadata: { email, role },
    ip: req.ip,
  });
  // Same shape whether or not an account already exists for this email.
  res.status(201).json({
    invitation: { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt },
    inviteLink: link,
  });
});

tenantAdminRouter.delete("/invitations/:id", async (req, res) => {
  const tenantId = req.auth!.tenant!.id;
  const result = await prisma.invitation.updateMany({
    where: { id: req.params.id, tenantId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count !== 1) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }
  await recordAudit({
    actorUserId: req.auth!.user.id,
    tenantId,
    action: "member.invite_revoke",
    targetType: "Invitation",
    targetId: req.params.id,
    ip: req.ip,
  });
  res.sendStatus(204);
});

tenantAdminRouter.patch("/members/:userId", async (req, res) => {
  const tenantId = req.auth!.tenant!.id;
  const role = roleFrom(req.body);
  if (!role) {
    res.status(400).json({ error: "Role must be TENANT_ADMIN or OPERATOR" });
    return;
  }
  if (req.params.userId === req.auth!.user.id) {
    res.status(400).json({ error: "You cannot change your own role" });
    return;
  }
  try {
    await prisma.$transaction(async (tx) => {
      const membership = await tx.membership.findFirst({
        where: { userId: req.params.userId, tenantId, status: "ACTIVE" },
      });
      if (!membership) throw new Error("NOT_FOUND");
      if (membership.role === "TENANT_ADMIN" && role === "OPERATOR") {
        const remaining = await tx.membership.count({
          where: { tenantId, status: "ACTIVE", role: "TENANT_ADMIN", id: { not: membership.id } },
        });
        if (remaining === 0) throw new Error("LAST_ADMIN");
      }
      await tx.membership.update({ where: { id: membership.id, tenantId }, data: { role } });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "NOT_FOUND") {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    if (code === "LAST_ADMIN") {
      res.status(400).json({ error: "A tenant must keep at least one admin" });
      return;
    }
    throw error;
  }
  await recordAudit({
    actorUserId: req.auth!.user.id,
    tenantId,
    action: "member.role_change",
    targetType: "User",
    targetId: req.params.userId,
    metadata: { role },
    ip: req.ip,
  });
  res.json({ ok: true, role });
});

tenantAdminRouter.delete("/members/:userId", async (req, res) => {
  const tenantId = req.auth!.tenant!.id;
  if (req.params.userId === req.auth!.user.id) {
    res.status(400).json({ error: "You cannot remove yourself" });
    return;
  }
  try {
    await prisma.$transaction(async (tx) => {
      const membership = await tx.membership.findFirst({
        where: { userId: req.params.userId, tenantId, status: "ACTIVE" },
      });
      if (!membership) throw new Error("NOT_FOUND");
      if (membership.role === "TENANT_ADMIN") {
        const remaining = await tx.membership.count({
          where: { tenantId, status: "ACTIVE", role: "TENANT_ADMIN", id: { not: membership.id } },
        });
        if (remaining === 0) throw new Error("LAST_ADMIN");
      }
      await tx.membership.update({
        where: { id: membership.id, tenantId },
        data: { status: "REMOVED", removedAt: new Date() },
      });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "NOT_FOUND") {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    if (code === "LAST_ADMIN") {
      res.status(400).json({ error: "A tenant must keep at least one admin" });
      return;
    }
    throw error;
  }
  await clearTenantFromSessions(req.params.userId, tenantId, "membership removed");
  await recordAudit({
    actorUserId: req.auth!.user.id,
    tenantId,
    action: "member.remove",
    targetType: "User",
    targetId: req.params.userId,
    ip: req.ip,
  });
  res.sendStatus(204);
});
