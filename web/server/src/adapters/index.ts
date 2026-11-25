import type { Tenant } from "../generated/prisma";
import type { CommerceAdapter } from "./types";
import { MockAdapter } from "./mock";

/**
 * tenant.adapter === "webhook" is the roadmap path (§5.6): same three methods,
 * calling the brand's own REST API instead of our seeded Postgres. Not built —
 * nothing in the demo exercises it, and every seeded tenant uses "mock".
 */
export function adapterFor(tenant: Tenant): CommerceAdapter {
  return new MockAdapter(tenant.id);
}
