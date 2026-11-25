import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const vitest = resolve("node_modules", "vitest", "vitest.mjs");
const result = spawnSync(process.execPath, [vitest, "run", "src/routes/__tests__/enquiry-workflow.integration.test.ts"], {
  env: { ...process.env, RUN_ENQUIRY_INTEGRATION: "1" },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
