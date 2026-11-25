import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import "../src/load-env";

const prismaCli = resolve("node_modules", "prisma", "build", "index.js");
const result = spawnSync(process.execPath, [prismaCli, ...process.argv.slice(2)], {
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
