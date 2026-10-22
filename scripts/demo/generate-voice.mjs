import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { EdgeTTS } = require("node-edge-tts");

import {
  audioDurationMsFromProbe,
  segmentAudioFilename,
  validateNarrationTimeline,
} from "./narration.mjs";
import {
  demoOutputDir,
  ensureDir,
  loadDemoEnv,
  probeMedia,
  readJson,
  repositoryRoot,
  writeJson,
} from "./utils.mjs";

const EDGE_TTS_VOICES = {
  female: "vi-VN-HoaiMyNeural",
  male: "vi-VN-NamMinhNeural",
};

export async function generateVoice(options = {}) {
  loadDemoEnv();
  const narrationPath = options.narrationPath || path.join(repositoryRoot, "demo", "narration.json");
  const timelinePath = options.timelinePath || path.join(demoOutputDir, "timeline.json");
  const audioDirectory = options.audioDirectory || path.join(demoOutputDir, "audio");
  const audioManifestPath = options.audioManifestPath || path.join(demoOutputDir, "audio-manifest.json");
  const narration = await readJson(narrationPath);
  const timeline = await readJson(timelinePath);
  const mapped = validateNarrationTimeline(narration, timeline);
  const voiceGender = options.voiceGender || process.env.EDGE_TTS_GENDER || "female";
  const edgeVoice = options.edgeVoice || process.env.EDGE_TTS_VOICE || EDGE_TTS_VOICES[voiceGender] || EDGE_TTS_VOICES.female;

  await ensureDir(audioDirectory);
  const segments = [];
  for (const [index, entry] of mapped.entries()) {
    const filename = segmentAudioFilename(index, entry.id);
    const outputPath = path.join(audioDirectory, filename);
    const tts = new EdgeTTS({ voice: edgeVoice, lang: "vi-VN" });
    await tts.ttsPromise(entry.text, outputPath);
    const fileInfo = await stat(outputPath);
    if (!fileInfo.isFile() || fileInfo.size === 0) {
      throw new Error(`Edge TTS returned empty audio for narration ID: ${entry.id}.`);
    }
    const durationMs = audioDurationMsFromProbe(await probeMedia(outputPath));
    if (entry.startMs + durationMs > entry.endMs) {
      throw new Error(
        `Narration audio exceeds its visible timeline step for ID: ${entry.id}. Increase demo pacing and rerun Playwright.`,
      );
    }
    segments.push({
      id: entry.id,
      step: entry.step,
      text: entry.text,
      file: path.relative(demoOutputDir, outputPath).replaceAll("\\", "/"),
      startMs: entry.startMs,
      durationMs,
    });
  }

  const manifest = {
    title: narration.title,
    language: narration.language,
    engine: "edge-tts",
    voice: edgeVoice,
    generatedAt: new Date().toISOString(),
    segments,
  };
  await writeJson(audioManifestPath, manifest);
  return { audioManifestPath, manifest };
}

async function main() {
  const result = await generateVoice();
  console.log(
    `NARRATION GENERATED: ${path.relative(repositoryRoot, result.audioManifestPath)} (${result.manifest.segments.length} segments)`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
