import "../src/load-env";
import { prisma, prismaUnscoped } from "../src/db/prisma";
import { createInvitation } from "../src/auth/invites";

/**
 * Creates a first TENANT_ADMIN invitation for each seeded tenant so the demo
 * can sign in without a hardcoded password. Prints links once.
 */
async function main(): Promise<void> {
  const tenants = await prismaUnscoped.tenant.findMany({ orderBy: { slug: "asc" } });
  if (tenants.length === 0) {
    console.log("No tenants found. Run `npm run prisma:seed` first.");
    return;
  }

  for (const tenant of tenants) {
    const email = `admin+${tenant.slug}@diya.local`.toLowerCase();
    let user = await prismaUnscoped.user.findUnique({ where: { email } });
    if (!user) {
      user = await prismaUnscoped.user.create({
        data: { email, name: `${tenant.name} admin` },
      });
    }
    const { link } = await createInvitation({
      email,
      tenantId: tenant.id,
      role: "TENANT_ADMIN",
      platformRole: null,
      invitedById: user.id,
    });
    console.log(`${tenant.name} (${tenant.slug}) admin invite:`);
    console.log(link);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
