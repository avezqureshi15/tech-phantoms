import { describe, expect, it } from "vitest";
import { validateTenantScope } from "../tenant-guard";

describe("tenant guard", () => {
  it("blocks tenant-scoped reads and writes without a tenantId predicate", () => {
    expect(validateTenantScope("CallSession", "findUnique", { where: { id: "call-1" } }))
      .toContain("tenantId predicate");
    expect(validateTenantScope("KnowledgeArticle", "findMany", { where: { category: "sweets" } }))
      .toContain("tenantId predicate");
    expect(validateTenantScope("Customer", "updateMany", { where: { doNotCall: true }, data: {} }))
      .toContain("tenantId predicate");
  });

  it("allows tenant-scoped operations that carry tenantId", () => {
    expect(validateTenantScope("CallSession", "findFirst", { where: { id: "call-1", tenantId: "t1" } })).toBeNull();
    expect(validateTenantScope("KnowledgeArticle", "create", { data: { tenantId: "t1", title: "x" } })).toBeNull();
    expect(validateTenantScope("Query", "updateMany", { where: { tenantId: "t1" }, data: { status: "NEW" } })).toBeNull();
  });

  it("requires tenantId on both sides of an upsert", () => {
    expect(validateTenantScope("CallOutcome", "upsert", {
      where: { callSessionId: "c1", tenantId: "t1" },
      create: { tenantId: "t1" },
      update: {},
    })).toBeNull();
    expect(validateTenantScope("CallOutcome", "upsert", {
      where: { callSessionId: "c1", tenantId: "t1" },
      create: {},
      update: {},
    })).toContain("upsert requires tenantId");
  });

  it("does not constrain global models", () => {
    expect(validateTenantScope("User", "findUnique", { where: { id: "u1" } })).toBeNull();
    expect(validateTenantScope("Tenant", "findMany", {})).toBeNull();
    expect(validateTenantScope(undefined, "findMany", {})).toBeNull();
  });
});
