import "../src/load-env";
import { seedOutboundData } from "../src/db/seed-outbound";
import { prisma } from "../src/db/prisma";

seedOutboundData()
  .then((summary) => console.log("Seeded outbound demo data:", summary))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
