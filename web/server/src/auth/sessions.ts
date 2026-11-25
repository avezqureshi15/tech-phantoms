import type { Request, Response } from "express";
import type { User } from "../generated/prisma";
import { prisma, prismaUnscoped } from "../db/prisma";
import { generateToken, hashToken } from "./tokens";

const IDLE_HOURS = Number(process.env.SESSION_IDLE_HOURS ?? 12);
const ABSOLUTE_HOURS = Number(process.env.SESSION_ABSOLUTE_HOURS ?? 168);
const TOUCH_INTERVAL_MS = 60_000;

export function sessionCookieName(): string {
  return process.env.SESSION_COOKIE_NAME ?? "diya_session";
}

function idleExpiry(now: Date): Date {
  return new Date(now.getTime() + IDLE_HOURS * 60 * 60 * 1000);
}

function absoluteExpiry(now: Date): Date {
  return new Date(now.getTime() + ABSOLUTE_HOURS * 60 * 60 * 1000);
}

export interface SessionUser {
  sessionId: string;
  user: User;
  viewAs: boolean;
}

export async function createSession(input: {
  userId: string;
  activeTenantId: string | null;
  ip?: string;
  userAgent?: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const now = new Date();
  const expiresAt = idleExpiry(now);
  await prisma.session.create({
    data: {
      userId: input.userId,
      tokenHash: hashToken(token),
      activeTenantId: input.activeTenantId,
      idleExpiresAt: expiresAt,
      absoluteExpiresAt: absoluteExpiry(now),
      ip: input.ip,
      userAgent: input.userAgent?.slice(0, 300),
    },
  });
  return { token, expiresAt };
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(sessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(sessionCookieName(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export function readCookieToken(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  const name = sessionCookieName();
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  const now = Date.now();
  if (
    session.revokedAt ||
    session.absoluteExpiresAt.getTime() <= now ||
    session.idleExpiresAt.getTime() <= now ||
    session.user.status !== "ACTIVE"
  ) {
    return null;
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    void prisma.session
      .update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), idleExpiresAt: idleExpiry(new Date()) },
      })
      .catch(() => undefined);
  }
  return {
    sessionId: session.id,
    user: session.user,
    viewAs: Boolean(session.viewAsExpiresAt && session.viewAsExpiresAt.getTime() > now),
  };
}

export async function getSessionRecord(sessionId: string) {
  return prisma.session.findUnique({ where: { id: sessionId } });
}

export async function setActiveTenant(sessionId: string, tenantId: string | null): Promise<void> {
  await prisma.session.update({ where: { id: sessionId }, data: { activeTenantId: tenantId } });
}

export async function revokeSession(sessionId: string, reason: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

export async function revokeAllSessionsForUser(userId: string, reason: string, exceptSessionId?: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/** Removed from one tenant: keep the session, clear only that workspace. */
export async function clearTenantFromSessions(userId: string, tenantId: string, reason: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, activeTenantId: tenantId, revokedAt: null },
    data: { activeTenantId: null, revokedReason: reason },
  });
}

export async function revokeSessionsForTenant(tenantId: string, reason: string): Promise<void> {
  await prisma.session.updateMany({
    where: { activeTenantId: tenantId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

export interface MembershipSummary {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  role: "TENANT_ADMIN" | "OPERATOR";
}

export async function listActiveMemberships(userId: string): Promise<MembershipSummary[]> {
  const rows = await prismaUnscoped.membership.findMany({
    where: { userId, status: "ACTIVE", tenant: { status: "ACTIVE" } },
    include: { tenant: { select: { id: true, slug: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    tenantId: row.tenantId,
    tenantSlug: row.tenant.slug,
    tenantName: row.tenant.name,
    role: row.role,
  }));
}

/** §3 active-tenant selection at sign-in. */
export async function pickActiveTenant(userId: string): Promise<string | null> {
  const previous = await prisma.session.findFirst({
    where: { userId, revokedAt: null, activeTenantId: { not: null } },
    orderBy: { lastSeenAt: "desc" },
    select: { activeTenantId: true },
  });
  const memberships = await listActiveMemberships(userId);
  if (previous?.activeTenantId && memberships.some((m) => m.tenantId === previous.activeTenantId)) {
    return previous.activeTenantId;
  }
  if (memberships.length === 1) return memberships[0].tenantId;
  return null;
}

export async function sweepExpiredSessions(): Promise<void> {
  await prisma.session.deleteMany({
    where: { OR: [{ absoluteExpiresAt: { lt: new Date() } }, { idleExpiresAt: { lt: new Date() } }] },
  });
}
