import { Router } from "express";
import type { PlatformRole, UserStatus } from "../generated/prisma";
import { prisma, prismaUnscoped } from "../db/prisma";
import { recordAudit } from "../auth/audit";
import { createInvitation, deliverInvitation, inviteLink } from "../auth/invites";
import { generateToken, hashToken } from "../auth/tokens";
import { revokeAllSessionsForUser, revokeSessionsForTenant } from "../auth/sessions";

export const platformRouter = Router();

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

platformRouter.get("/tenants", async (_req, res) => {
  const tenants = await prisma.tenant.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { memberships: true, queries: true } } },
  });
  res.json({
    tenants: tenants.map((tenant) => ({
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      brandTone: tenant.brandTone,
      status: tenant.status,
      memberCount: tenant._count.memberships,
      queryCount: tenant._count.queries,
    })),
  });
});

platformRouter.post("/tenants", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const adminEmail = typeof req.body?.adminEmail === "string" ? req.body.adminEmail.trim().toLowerCase() : "";
  const brandTone = typeof req.body?.brandTone === "string" && req.body.brandTone.trim()
    ? req.body.brandTone.trim()
    : "warm";
  const slug = typeof req.body?.slug === "string" && req.body.slug.trim()
    ? slugify(req.body.slug)
    : slugify(name);
  if (name.length < 2 || name.length > 120) {
    res.status(400).json({ error: "Tenant name must be between 2 and 120 characters" });
    return;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    res.status(400).json({ error: "Slug must use lowercase letters, numbers and hyphens" });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    res.status(400).json({ error: "A valid first-admin email is required" });
    return;
  }
  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) {
    res.status(409).json({ error: "That slug is already in use" });
    return;
  }

  let created: { tenantId: string; invitationId: string; link: string };
  try {
    created = await prismaUnscoped.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name, slug, brandTone, createdById: req.auth!.user.id },
      });
      const token = generateToken();
      const invitation = await tx.invitation.create({
        data: {
          email: adminEmail,
          tenantId: tenant.id,
          role: "TENANT_ADMIN",
          tokenHash: hashToken(token),
          invitedById: req.auth!.user.id,
          expiresAt: new Date(Date.now() + Number(process.env.INVITE_TTL_HOURS ?? 168) * 60 * 60 * 1000),
        },
      });
      return { tenantId: tenant.id, invitationId: invitation.id, link: inviteLink(token) };
    });
  } catch (error) {
    console.error("Tenant creation failed", error instanceof Error ? error.message : "unknown");
    res.status(500).json({ error: "Could not create the tenant" });
    return;
  }

  await deliverInvitation({ email: adminEmail, link: created.link, tenantName: name, role: "TENANT_ADMIN" });
  await recordAudit({
    actorUserId: req.auth!.user.id,
    tenantId: created.tenantId,
    action: "tenant.create",
    targetType: "Tenant",
    targetId: created.tenantId,
    metadata: { slug, adminEmail },
    ip: req.ip,
  });
  res.status(201).json({
    tenant: { id: created.tenantId, slug, name },
    invitation: { id: created.invitationId, email: adminEmail, role: "TENANT_ADMIN" },
    inviteLink: created.link,
  });
});

platformRouter.patch("/tenants/:id", async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
  const status = req.body?.status === "SUSPENDED" || req.body?.status === "ACTIVE"
    ? (req.body.status as "SUSPENDED" | "ACTIVE")
    : undefined;
  if (name !== undefined && (name.length < 2 || name.length > 120)) {
    res.status(400).json({ error: "Tenant name must be between 2 and 120 characters" });
    return;
  }
  if (name === undefined && status === undefined) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }
  const updated = await prisma.tenant.update({
    where: { id: tenant.id },
    data: { ...(name ? { name } : {}), ...(status ? { status } : {}) },
  });
  if (status === "SUSPENDED") {
    await revokeSessionsForTenant(tenant.id, "tenant suspended");
    await recordAudit({
      actorUserId: req.auth!.user.id,
      tenantId: tenant.id,
      action: "tenant.suspend",
      targetType: "Tenant",
      targetId: tenant.id,
      ip: req.ip,
    });
  } else {
    await recordAudit({
      actorUserId: req.auth!.user.id,
      tenantId: tenant.id,
      action: "tenant.update",
      targetType: "Tenant",
      targetId: tenant.id,
      metadata: { name: updated.name, status: updated.status },
      ip: req.ip,
    });
  }
  res.json({ tenant: { id: updated.id, slug: updated.slug, name: updated.name, status: updated.status } });
});

platformRouter.post("/tenants/:id/invitations", async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "A valid email address is required" });
    return;
  }
  const { invitation, link } = await createInvitation({
    email,
    tenantId: tenant.id,
    role: "TENANT_ADMIN",
    platformRole: null,
    invitedById: req.auth!.user.id,
  });
  await deliverInvitation({ email, link, tenantName: tenant.name, role: "TENANT_ADMIN" });
  await recordAudit({
    actorUserId: req.auth!.user.id,
    tenantId: tenant.id,
    action: "member.invite",
    targetType: "Invitation",
    targetId: invitation.id,
    metadata: { email, role: "TENANT_ADMIN", source: "platform" },
    ip: req.ip,
  });
  res.status(201).json({
    invitation: { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt },
    inviteLink: link,
  });
});

platformRouter.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      memberships: {
        include: { tenant: { select: { id: true, slug: true, name: true } } },
      },
    },
  });
  res.json({
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.platformRole as PlatformRole,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      memberships: user.memberships.map((membership) => ({
        tenantId: membership.tenantId,
        tenantSlug: membership.tenant.slug,
        tenantName: membership.tenant.name,
        role: membership.role,
        status: membership.status,
      })),
    })),
  });
});

platformRouter.patch("/users/:id", async (req, res) => {
  const status = req.body?.status === "SUSPENDED" || req.body?.status === "ACTIVE"
    ? (req.body.status as UserStatus)
    : null;
  if (!status) {
    res.status(400).json({ error: "status must be ACTIVE or SUSPENDED" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.id === req.auth!.user.id && status === "SUSPENDED") {
    res.status(400).json({ error: "You cannot suspend yourself" });
    return;
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      status,
      ...(status === "ACTIVE" ? { failedLoginCount: 0, lockedUntil: null } : {}),
    },
  });
  if (status === "SUSPENDED") {
    await revokeAllSessionsForUser(user.id, "user suspended");
  }
  await recordAudit({
    actorUserId: req.auth!.user.id,
    action: status === "SUSPENDED" ? "user.suspend" : "user.reactivate",
    targetType: "User",
    targetId: user.id,
    ip: req.ip,
  });
  res.json({ user: { id: updated.id, email: updated.email, status: updated.status } });
});
