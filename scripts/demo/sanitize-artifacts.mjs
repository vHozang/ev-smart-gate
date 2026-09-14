import path from "node:path";

import {
  assertNoConfiguredSecrets,
  collectConfiguredSecrets,
  sanitizeTraceArtifacts,
} from "./security.mjs";
import {
  demoOutputDir,
  loadDemoEnv,
  playwrightOutputDir,
} from "./utils.mjs";

async function main() {
  const environment = loadDemoEnv();
  const reportDirectory = path.join(demoOutputDir, "playwright-report");
  const roots = [playwrightOutputDir, reportDirectory];
  const secrets = collectConfiguredSecrets(environment);
  const sanitized = await sanitizeTraceArtifacts(roots, { secrets });
  await assertNoConfiguredSecrets(roots, { secrets });
  console.log(`SANITIZED TRACES: ${sanitized.length}`);
}

main().catch((error) => {
  console.error(`TRACE SANITIZATION FAILED: ${error.message}`);
  process.exitCode = 1;
});
