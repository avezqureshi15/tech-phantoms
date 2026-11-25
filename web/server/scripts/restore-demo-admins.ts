import "../src/load-env";
import { prismaUnscoped } from "../src/db/prisma";
import { restoreDemoAdminMemberships } from "../src/db/reseed";

restoreDemoAdminMemberships()
  .then((count) => console.log(`Restored ${count} demo admin membership(s).`))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaUnscoped.$disconnect();
  });
