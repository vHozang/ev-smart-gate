import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

import { buildSrtCues, renderSrt } from "./narration.mjs";
import {
  demoOutputDir,
  ensureDir,
  loadDemoEnv,
  readJson,
  repositoryRoot,
} from "./utils.mjs";

export async function generateSrt(options = {}) {
  loadDemoEnv();
  const narrationPath = options.narrationPath || path.join(repositoryRoot, "demo", "narration.json");
  const timelinePath = options.timelinePath || path.join(demoOutputDir, "timeline.json");
  const audioManifestPath = options.audioManifestPath || path.join(demoOutputDir, "audio-manifest.json");
  const outputPath = options.outputPath || path.join(demoOutputDir, "subtitles.srt");

  const [narration, timeline, audioManifest] = await Promise.all([
    readJson(narrationPath),
    readJson(timelinePath),
    readJson(audioManifestPath),
  ]);
  const cues = buildSrtCues(narration, timeline, audioManifest);
  await ensureDir(path.dirname(outputPath));
  await writeFile(outputPath, renderSrt(cues), "utf8");
  return { outputPath, cues };
}

async function main() {
  const result = await generateSrt();
  console.log(`SUBTITLES GENERATED: ${path.relative(repositoryRoot, result.outputPath)} (${result.cues.length} cues)`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`SUBTITLE GENERATION FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
