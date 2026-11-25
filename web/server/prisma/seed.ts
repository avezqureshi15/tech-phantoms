import "../src/load-env";
import { reseedDemoData } from "../src/db/reseed";
import { prisma } from "../src/db/prisma";

reseedDemoData()
  .then((summary) => console.log("Seeded:", summary))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
