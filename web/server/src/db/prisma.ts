import { PrismaClient } from "../generated/prisma";
import { tenantGuard } from "./tenant-guard";

const globalForPrisma = globalThis as unknown as {
  prismaUnscoped: PrismaClient | undefined;
};

/**
 * Use `prisma` everywhere. It refuses tenant-scoped model operations that omit a
 * tenantId predicate. `prismaUnscoped` is the explicit escape hatch for seeders,
 * public integration-ID resolution, Twilio webhooks, auth/session bootstrap
 * and the platform tenant directory.
 */
export const prismaUnscoped = globalForPrisma.prismaUnscoped ?? new PrismaClient();
export const prisma = prismaUnscoped.$extends(tenantGuard);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaUnscoped = prismaUnscoped;
}
