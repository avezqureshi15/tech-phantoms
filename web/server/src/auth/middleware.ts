import type { NextFunction, Request, Response } from "express";
import type { PlatformRole, TenantRole, UserStatus } from "../generated/prisma";
import { prisma } from "../db/prisma";
import { getSessionRecord, readCookieToken, verifySessionToken } from "./sessions";

export interface AuthContext {
  user: {
    id: string;
    email: string;
    name: string;
    platformRole: PlatformRole;
    status: UserStatus;
  };
  session: { id: string; viewAs: boolean };
  tenant?: { id: string; slug: string; name: string; brandTone: string };
  role?: TenantRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = readCookieToken(req);
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const verified = await verifySessionToken(token);
    if (!verified) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    req.auth = {
      user: {
        id: verified.user.id,
        email: verified.user.email,
        name: verified.user.name,
        platformRole: verified.user.platformRole,
        status: verified.user.status,
      },
      session: { id: verified.sessionId, viewAs: verified.viewAs },
    };
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.auth) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const session = await getSessionRecord(req.auth.session.id);
    if (!session || session.revokedAt) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!session.activeTenantId) {
      res.status(409).json({ code: "NO_ACTIVE_TENANT", error: "Choose a workspace to continue" });
      return;
    }
    const membership = await prisma.membership.findFirst({
      where: { userId: req.auth.user.id, tenantId: session.activeTenantId, status: "ACTIVE" },
      include: { tenant: true },
    });
    if (!membership || membership.tenant.status !== "ACTIVE") {
      res.status(409).json({ code: "NO_ACTIVE_TENANT", error: "Choose a workspace to continue" });
      return;
    }
    req.auth.tenant = {
      id: membership.tenant.id,
      slug: membership.tenant.slug,
      name: membership.tenant.name,
      brandTone: membership.tenant.brandTone,
    };
    req.auth.role = membership.role;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: TenantRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth?.role || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: "You do not have permission to do that" });
      return;
    }
    next();
  };
}

export function rejectViewAsMutation(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.session.viewAs && req.method !== "GET") {
    res.status(403).json({ error: "View-as sessions are read-only" });
    return;
  }
  next();
}

export function requirePlatform(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.user.platformRole !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Super admin access required" });
    return;
  }
  next();
}

export function requireTenantId(req: Request, res: Response): string | null {
  if (!req.auth?.tenant) {
    res.status(409).json({ code: "NO_ACTIVE_TENANT", error: "Choose a workspace to continue" });
    return null;
  }
  return req.auth.tenant.id;
}
