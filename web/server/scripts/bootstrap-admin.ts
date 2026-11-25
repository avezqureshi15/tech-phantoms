import "../src/load-env";
import { prisma, prismaUnscoped } from "../src/db/prisma";
import { createInvitation } from "../src/auth/invites";

async function main(): Promise<void> {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Set BOOTSTRAP_ADMIN_EMAIL to a valid email address");
  }

  let user = await prismaUnscoped.user.findUnique({ where: { email } });
  if (!user) {
    user = await prismaUnscoped.user.create({
      data: {
        email,
        name: process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Platform admin",
        platformRole: "SUPER_ADMIN",
      },
    });
  } else if (user.platformRole !== "SUPER_ADMIN") {
    user = await prismaUnscoped.user.update({
      where: { id: user.id },
      data: { platformRole: "SUPER_ADMIN" },
    });
  }

  if (user.passwordHash) {
    console.log(`Super admin already active: ${user.email}`);
    return;
  }

  const { link } = await createInvitation({
    email: user.email,
    tenantId: null,
    role: null,
    platformRole: "SUPER_ADMIN",
    invitedById: user.id,
  });
  console.log("Bootstrap super-admin invitation (single use, 7 days):");
  console.log(link);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
