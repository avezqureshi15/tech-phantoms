import { Prisma } from "../generated/prisma";

/**
 * Models that hold tenant-owned data. Every operation on these must carry a
 * tenantId predicate. The guard is deliberately a hard throw, not a silent
 * injection: a mistake should fail loudly in development and tests.
 *
 * Legitimate cross-tenant paths use the explicit `prismaUnscoped` export and
 * are limited to seeders, public integration-ID resolution, Twilio webhooks,
 * auth/session bootstrap and the platform tenant directory.
 */
export const TENANT_SCOPED_MODELS = new Set([
  "Customer",
  "Order",
  "Ticket",
  "Message",
  "AgentAction",
  "Approval",
  "Product",
  "Query",
  "CallSession",
  "CallTurn",
  "CallOutcome",
  "KnowledgeArticle",
  "WidgetInstallation",
  "Enquiry",
  "Membership",
  "Invitation",
  "AuditEvent",
]);

const WHERE_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasTenantId(value: unknown): boolean {
  const record = asRecord(value);
  return typeof record?.tenantId === "string" && record.tenantId.length > 0;
}

function createDataHasTenantId(data: unknown): boolean {
  if (Array.isArray(data)) return data.length > 0 && data.every(hasTenantId);
  return hasTenantId(data);
}

/** Returns an error message when a tenant-scoped operation is unsafe. */
export function validateTenantScope(model: string | undefined, operation: string, args: unknown): string | null {
  if (!model || !TENANT_SCOPED_MODELS.has(model)) return null;
  const payload = asRecord(args) ?? {};
  const where = asRecord(payload.where);
  if (WHERE_OPS.has(operation)) {
    return hasTenantId(where) ? null : `${model}.${operation} ran without a tenantId predicate`;
  }
  if (CREATE_OPS.has(operation)) {
    return createDataHasTenantId(payload.data) ? null : `${model}.${operation} ran without a tenantId in data`;
  }
  if (operation === "upsert") {
    const create = asRecord(payload.create);
    return hasTenantId(where) && hasTenantId(create)
      ? null
      : `${model}.upsert requires tenantId in where and create`;
  }
  return null;
}

export const tenantGuard = Prisma.defineExtension({
  name: "tenant-guard",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const violation = validateTenantScope(model, operation, args);
        if (violation) throw new Error(violation);
        return query(args);
      },
    },
  },
});
