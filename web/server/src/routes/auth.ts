import { Router } from "express";
import type { Request } from "express";
import { prisma, prismaUnscoped } from "../db/prisma";
import { recordAudit } from "../auth/audit";
import {
  hashPassword,
  validatePassword,
  verifyAgainstDummy,
  verifyPassword,
} from "../auth/passwords";
import { hashToken } from "../auth/tokens";
import {
  clearSessionCookie,
  createSession,
  listActiveMemberships,
  pickActiveTenant,
  readCookieToken,
  revokeAllSessionsForUser,
  revokeSession,
  setActiveTenant,
  setSessionCookie,
  verifySessionToken,
} from "../auth/sessions";
import { requireAuth } from "../auth/middleware";

export const authRouter = Router();

const MAX_ACCOUNT_FAILURES = 10;
const LOCK_MINUTES = 15;
const WINDOW_MS = 15 * 60 * 1000;

interface FailureBucket {
  count: number;
  firstAt: number;
}

const failures = new Map<string, FailureBucket>();

function throttleKey(email: string, ip: string): string {
  return `${email}:${ip}`;
}

function isThrottled(key: string): boolean {
  const bucket = failures.get(key);
  if (!bucket) return false;
  if (Date.now() - bucket.firstAt > WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return bucket.count >= MAX_ACCOUNT_FAILURES;
}

function registerFailure(key: string): void {
  const now = Date.now();
  const bucket = failures.get(key);
  if (!bucket || now - bucket.firstAt > WINDOW_MS) {
    failures.set(key, { count: 1, firstAt: now });
    return;
  }
  bucket.count += 1;
}

function clearFailures(key: string): void {
  failures.delete(key);
}

function emailFrom(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const value = (body as Record<string, unknown>).email;
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function passwordFrom(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const value = (body as Record<string, unknown>).password;
  return typeof value === "string" ? value : "";
}

function requestMeta(req: Request) {
  return { ip: req.ip?.slice(0, 80), userAgent: req.get("user-agent")?.slice(0, 300) };
}

function publicUser(user: {
  id: string;
  email: string;
  name: string;
  platformRole: "NONE" | "SUPER_ADMIN";
}) {
  return { id: user.id, email: user.email, name: user.name, platformRole: user.platformRole };
}

authRouter.post("/sign-in", async (req, res) => {
  const email = emailFrom(req.body);
  const password = passwordFrom(req.body);
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const meta = requestMeta(req);
  const key = throttleKey(email, meta.ip ?? "unknown");
  if (isThrottled(key)) {
    res.status(429).json({ error: "Too many sign-in attempts. Try again later." });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await verifyAgainstDummy(password);
    registerFailure(key);
    await recordAudit({ action: "auth.sign_in_failed", metadata: { email }, ip: meta.ip });
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (user.status === "SUSPENDED" || (user.lockedUntil && user.lockedUntil.getTime() > Date.now())) {
    await verifyAgainstDummy(password);
    registerFailure(key);
    await recordAudit({
      actorUserId: user.id,
      action: "auth.sign_in_failed",
      metadata: { reason: user.status === "SUSPENDED" ? "suspended" : "locked" },
      ip: meta.ip,
    });
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const nextCount = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: nextCount,
        lockedUntil: nextCount >= MAX_ACCOUNT_FAILURES
          ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
          : user.lockedUntil,
      },
    });
    registerFailure(key);
    await recordAudit({ actorUserId: user.id, action: "auth.sign_in_failed", metadata: { email }, ip: meta.ip });
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  clearFailures(key);
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  const activeTenantId = await pickActiveTenant(user.id);
  const session = await createSession({ userId: user.id, activeTenantId, ...meta });
  setSessionCookie(res, session.token, session.expiresAt);
  const memberships = await listActiveMemberships(user.id);
  const activeTenant = memberships.find((m) => m.tenantId === activeTenantId) ?? null;
  await recordAudit({ actorUserId: user.id, tenantId: activeTenantId, action: "auth.sign_in", ip: meta.ip });

  res.json({
    ok: true,
    user: publicUser(user),
    memberships,
    activeTenant: activeTenant
      ? { id: activeTenant.tenantId, slug: activeTenant.tenantSlug, name: activeTenant.tenantName, role: activeTenant.role }
      : null,
  });
});

authRouter.post("/sign-out", requireAuth, async (req, res) => {
  await revokeSession(req.auth!.session.id, "user sign-out");
  clearSessionCookie(res);
  await recordAudit({ actorUserId: req.auth!.user.id, action: "auth.sign_out", ip: req.ip });
  res.json({ ok: true });
});

authRouter.post("/sign-out-all", requireAuth, async (req, res) => {
  await revokeAllSessionsForUser(req.auth!.user.id, "user sign-out-all");
  clearSessionCookie(res);
  await recordAudit({ actorUserId: req.auth!.user.id, action: "auth.sign_out_all", ip: req.ip });
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const memberships = await listActiveMemberships(req.auth!.user.id);
  const session = await prisma.session.findUnique({ where: { id: req.auth!.session.id } });
  const active = memberships.find((m) => m.tenantId === session?.activeTenantId) ?? null;
  res.json({
    user: req.auth!.user,
    session: { viewAs: req.auth!.session.viewAs },
    memberships,
    activeTenant: active
      ? { id: active.tenantId, slug: active.tenantSlug, name: active.tenantName, role: active.role }
      : null,
  });
});

authRouter.post("/switch-tenant", requireAuth, async (req, res) => {
  const slug = typeof req.body?.tenantSlug === "string" ? req.body.tenantSlug.trim() : "";
  if (!slug) {
    res.status(400).json({ error: "tenantSlug is required" });
    return;
  }
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant || tenant.status !== "ACTIVE") {
    res.status(403).json({ error: "You do not have access to that workspace" });
    return;
  }
  const membership = await prisma.membership.findFirst({
    where: { userId: req.auth!.user.id, tenantId: tenant.id, status: "ACTIVE" },
  });
  if (!membership) {
    res.status(403).json({ error: "You do not have access to that workspace" });
    return;
  }
  await setActiveTenant(req.auth!.session.id, tenant.id);
  await recordAudit({
    actorUserId: req.auth!.user.id,
    tenantId: tenant.id,
    action: "auth.switch_tenant",
    ip: req.ip,
  });
  res.json({
    ok: true,
    activeTenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, role: membership.role },
  });
});

authRouter.get("/invite/:token", async (req, res) => {
  const invitation = await prismaUnscoped.invitation.findUnique({
    where: { tokenHash: hashToken(req.params.token) },
    include: { tenant: { select: { name: true } }, invitedBy: { select: { name: true } } },
  });
  if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt.getTime() <= Date.now()) {
    res.status(404).json({ error: "This invitation is no longer valid" });
    return;
  }
  const existing = await prisma.user.findUnique({ where: { email: invitation.email } });
  res.json({
    email: invitation.email,
    tenantName: invitation.tenant?.name ?? "Diya platform",
    role: invitation.role ?? invitation.platformRole,
    invitedBy: invitation.invitedBy.name,
    requiresPassword: !existing?.passwordHash,
    existingAccount: Boolean(existing),
  });
});

authRouter.post("/accept-invite", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!token) {
    res.status(400).json({ error: "Invitation token is required" });
    return;
  }

  const invitation = await prismaUnscoped.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { tenant: true, invitedBy: { select: { name: true } } },
  });
  if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt.getTime() <= Date.now()) {
    res.status(404).json({ error: "This invitation is no longer valid" });
    return;
  }

  const cookieToken = readCookieToken(req);
  const signedIn = cookieToken ? await verifySessionToken(cookieToken) : null;
  const existing = await prisma.user.findUnique({ where: { email: invitation.email } });

  let passwordHash: string | undefined;
  if (existing?.passwordHash) {
    if (signedIn && signedIn.user.email === existing.email) {
      passwordHash = undefined;
    } else {
      const ok = await verifyPassword(password, existing.passwordHash);
      if (!ok) {
        res.status(401).json({ error: "Enter your existing account password to accept this invitation" });
        return;
      }
    }
  } else if (existing) {
    const invalid = validatePassword(password, invitation.email);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }
    passwordHash = await hashPassword(password);
  } else {
    if (name.length < 2 || name.length > 120) {
      res.status(400).json({ error: "Name must be between 2 and 120 characters" });
      return;
    }
    const invalid = validatePassword(password, invitation.email);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }
    passwordHash = await hashPassword(password);
  }

  const meta = requestMeta(req);
  const result = await prismaUnscoped.$transaction(async (tx) => {
    const claimed = await tx.invitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count !== 1) throw new Error("INVITE_ALREADY_USED");

    let user = existing;
    if (!user) {
      user = await tx.user.create({
        data: {
          email: invitation.email,
          name,
          passwordHash: passwordHash ?? null,
          passwordChangedAt: passwordHash ? new Date() : null,
          platformRole: invitation.platformRole ?? "NONE",
        },
      });
    } else {
      const updates: { passwordHash?: string; passwordChangedAt?: Date; platformRole?: "SUPER_ADMIN" } = {};
      if (passwordHash) {
        updates.passwordHash = passwordHash;
        updates.passwordChangedAt = new Date();
      }
      if (invitation.platformRole === "SUPER_ADMIN") updates.platformRole = "SUPER_ADMIN";
      if (Object.keys(updates).length > 0) {
        user = await tx.user.update({ where: { id: user.id }, data: updates });
      }
    }

    if (invitation.tenantId && invitation.role) {
      await tx.membership.upsert({
        where: { userId_tenantId: { userId: user.id, tenantId: invitation.tenantId } },
        create: {
          userId: user.id,
          tenantId: invitation.tenantId,
          role: invitation.role,
          status: "ACTIVE",
          invitedById: invitation.invitedById,
        },
        update: {
          role: invitation.role,
          status: "ACTIVE",
          removedAt: null,
          invitedById: invitation.invitedById,
        },
      });
    }

    return user;
  });

  await recordAudit({
    actorUserId: result.id,
    tenantId: invitation.tenantId,
    action: "member.accept",
    targetType: "Invitation",
    targetId: invitation.id,
    ip: meta.ip,
  });

  const activeTenantId = invitation.tenantId;
  const session = await createSession({ userId: result.id, activeTenantId, ...meta });
  setSessionCookie(res, session.token, session.expiresAt);
  const memberships = await listActiveMemberships(result.id);
  res.json({
    ok: true,
    user: publicUser(result),
    memberships,
    activeTenant: activeTenantId
      ? memberships.find((m) => m.tenantId === activeTenantId) ?? null
      : null,
  });
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  const user = await prisma.user.findUnique({ where: { id: req.auth!.user.id } });
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  const invalid = validatePassword(newPassword, user.email);
  if (invalid) {
    res.status(400).json({ error: invalid });
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() },
  });
  await revokeAllSessionsForUser(user.id, "password change", req.auth!.session.id);
  await recordAudit({ actorUserId: user.id, action: "auth.password_change", ip: req.ip });
  res.json({ ok: true });
});
