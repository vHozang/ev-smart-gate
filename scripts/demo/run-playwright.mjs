import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertNoConfiguredSecrets,
  collectConfiguredSecrets,
  sanitizeTraceArtifacts,
} from "./security.mjs";
import {
  demoOutputDir,
  loadDemoEnv,
  playwrightOutputDir,
  requireLocalHttpUrl,
  run,
} from "./utils.mjs";

const playwrightCli = path.join(
  process.cwd(),
  "node_modules",
  "@playwright",
  "test",
  "cli.js",
);

export async function runPlaywrightDemo(options = {}) {
  const environment = options.environment || loadDemoEnv();
  requireLocalHttpUrl(environment.DEMO_BASE_URL, "DEMO_BASE_URL");
  requireLocalHttpUrl(
    environment.DEMO_CAMERA_URL || "http://localhost:18081",
    "DEMO_CAMERA_URL",
  );
  const roots = options.roots || [
    playwrightOutputDir,
    path.join(demoOutputDir, "playwright-report"),
  ];
  const secrets = options.secrets || collectConfiguredSecrets(environment);
  const runCommand = options.runCommand || (() =>
    run(process.execPath, [
      playwrightCli,
      "test",
      "tests/demo/mvp-demo.spec.ts",
      "--project=mvp-demo",
    ]));
  const sanitize = options.sanitize || sanitizeTraceArtifacts;
  const scan = options.scan || assertNoConfiguredSecrets;

  let failure;
  try {
    await runCommand();
  } catch (error) {
    failure = error;
  } finally {
    await sanitize(roots, { secrets });
    await scan(roots, { secrets });
  }
  if (failure) throw failure;
}

async function main() {
  await runPlaywrightDemo();
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
