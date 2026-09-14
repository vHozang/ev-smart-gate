import { copyFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildDemo } from "./build-demo.mjs";
import { generateSrt } from "./generate-srt.mjs";
import { generateVoice } from "./generate-voice.mjs";
import { runPlaywrightDemo } from "./run-playwright.mjs";
import {
  assertNoConfiguredSecrets,
  collectConfiguredSecrets,
} from "./security.mjs";
import {
  demoOutputDir,
  loadDemoEnv,
  playwrightOutputDir,
  probeMedia,
  repositoryRoot,
  resetGeneratedArtifacts,
  requireLocalHttpUrl,
  resolveFfmpeg,
  resolveFfprobe,
  run,
  verifyFinalVideo,
} from "./utils.mjs";

const composeServices = [
  "mongodb",
  "mongodb-init",
  "minio",
  "minio-init",
  "barrier-simulator",
  "camera-simulator",
  "api",
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(filename));
    else if (entry.isFile()) files.push(filename);
  }
  return files;
}

export async function discoverSingleRunArtifact(root, basename, sinceMs) {
  const candidates = [];
  for (const filename of await walk(root)) {
    if (path.basename(filename) !== basename) continue;
    const details = await stat(filename);
    if (details.size > 0 && details.mtimeMs >= sinceMs) candidates.push(filename);
  }
  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one current-run ${basename}; found ${candidates.length}.`,
    );
  }
  return candidates[0];
}

export function validateRunnerEnvironment(environment = process.env) {
  // Edge TTS is used instead of OpenAI — no API key required.
  if (environment.DEMO_BURN_SUBTITLES === "false") {
    throw new Error("DEMO_BURN_SUBTITLES must be true for the final MVP demo.");
  }
  requireLocalHttpUrl(environment.DEMO_BASE_URL, "DEMO_BASE_URL");
  requireLocalHttpUrl(
    environment.DEMO_CAMERA_URL || "http://localhost:18081",
    "DEMO_CAMERA_URL",
  );
  return environment;
}

async function endpointReady(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return false;
    const body = await response.json().catch(() => null);
    return body?.status === "ready" || body?.ready === true || response.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForReady(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await endpointReady(url)) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Application readiness timeout: ${url}`);
}

async function ensureApplicationReady(baseURL) {
  const readyURL = new URL("/health/ready", baseURL).toString();
  if (await endpointReady(readyURL)) {
    console.log(`APP READY: ${readyURL}`);
    return { startedCompose: false, readyURL };
  }

  console.log("APP NOT READY: starting the local Docker Compose demo stack.");
  await run("docker", ["compose", "up", "-d", "--build", ...composeServices]);
  await waitForReady(readyURL);
  console.log(`APP READY: ${readyURL}`);
  return { startedCompose: true, readyURL };
}

async function requireNonEmptyFile(filename, label) {
  const details = await stat(filename).catch(() => null);
  if (!details?.isFile() || details.size <= 0) {
    throw new Error(`${label} was not generated: ${filename}`);
  }
  return details;
}

async function requireDirectory(filename, label) {
  const details = await stat(filename).catch(() => null);
  if (!details?.isDirectory()) {
    throw new Error(`${label} was not generated: ${filename}`);
  }
}

export async function runDemo() {
  const environment = validateRunnerEnvironment(loadDemoEnv());
  await Promise.all([resolveFfmpeg(), resolveFfprobe()]);
  const baseURL = environment.DEMO_BASE_URL;
  const app = await ensureApplicationReady(baseURL);

  await resetGeneratedArtifacts();
  const runStartedAt = Date.now();
  const reportDirectory = path.join(demoOutputDir, "playwright-report");
  const configuredSecrets = collectConfiguredSecrets(environment);
  console.log("PLAYWRIGHT: running the real MVP demo with sanitized artifacts.");
  await runPlaywrightDemo({ environment, secrets: configuredSecrets });

  const sourceVideo = await discoverSingleRunArtifact(
    playwrightOutputDir,
    "video.webm",
    runStartedAt,
  );
  const tracePath = await discoverSingleRunArtifact(
    playwrightOutputDir,
    "trace.zip",
    runStartedAt,
  );
  const rawVideoPath = path.join(demoOutputDir, "raw-demo.webm");
  await copyFile(sourceVideo, rawVideoPath);
  await requireNonEmptyFile(rawVideoPath, "Raw Playwright video");
  const rawProbe = await probeMedia(rawVideoPath);
  const rawVideo = rawProbe.streams?.find((stream) => stream.codec_type === "video");
  if (!rawVideo || Number(rawProbe?.format?.duration) <= 0) {
    throw new Error("Raw Playwright video lacks a valid video stream or duration.");
  }

  const timelinePath = path.join(demoOutputDir, "timeline.json");
  const reportPath = path.join(reportDirectory, "index.html");
  await Promise.all([
    requireNonEmptyFile(timelinePath, "Playwright timeline"),
    requireNonEmptyFile(reportPath, "Playwright HTML report"),
    requireNonEmptyFile(tracePath, "Playwright trace"),
    requireDirectory(path.dirname(tracePath), "Playwright test result directory"),
  ]);
  await assertNoConfiguredSecrets(
    [timelinePath, rawVideoPath],
    { secrets: configuredSecrets },
  );

  console.log("NARRATION: generating OpenAI TTS segments.");
  const voice = await generateVoice();
  console.log("SUBTITLES: generating timeline-derived SRT cues.");
  const subtitles = await generateSrt();
  console.log("FFMPEG: synchronizing narration and encoding final videos.");
  const media = await buildDemo({ rawVideoPath });
  const finalVerification = await verifyFinalVideo(media.finalVideoPath, {
    expectedWidth: 1440,
    expectedHeight: 900,
    expectedPixelFormat: "yuv420p",
    minimumDuration: 45,
    maximumDuration: 120,
  });
  await assertNoConfiguredSecrets(
    [demoOutputDir, playwrightOutputDir],
    { secrets: configuredSecrets },
  );

  const summary = {
    appURL: baseURL,
    startedCompose: app.startedCompose,
    rawVideoPath,
    timelinePath,
    audioManifestPath: voice.audioManifestPath,
    subtitlesPath: subtitles.outputPath,
    narrationPath: media.narrationPath,
    voiceVideoPath: media.voiceVideoPath,
    finalVideoPath: media.finalVideoPath,
    reportPath,
    tracePath,
    finalVerification,
  };
  console.log("MVP DEMO PIPELINE: PASS");
  console.log(`FINAL VIDEO: ${path.relative(repositoryRoot, media.finalVideoPath)}`);
  console.log(
    `VERIFIED: ${finalVerification.width}x${finalVerification.height} | ${finalVerification.videoCodec}/${finalVerification.audioCodec} | ${finalVerification.duration.toFixed(2)}s`,
  );
  return summary;
}

async function main() {
  await runDemo();
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
