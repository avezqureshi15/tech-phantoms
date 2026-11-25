import type { Prisma } from "../generated/prisma";
import { prismaUnscoped } from "../db/prisma";

export interface AuditInput {
  actorUserId?: string | null;
  tenantId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/** Never let an audit write break the request it is describing. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prismaUnscoped.auditEvent.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        tenantId: input.tenantId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        ip: input.ip?.slice(0, 80) ?? null,
      },
    });
  } catch (error) {
    console.error("Audit write failed", {
      action: input.action,
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
}
