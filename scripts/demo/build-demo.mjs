import { copyFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  demoOutputDir,
  loadDemoEnv,
  probeMedia,
  readJson,
  repositoryRoot,
  resolveFfmpeg,
  run,
  verifyFinalVideo,
} from "./utils.mjs";

function seconds(milliseconds) {
  return Number((milliseconds / 1000).toFixed(3)).toString();
}

export function validateBuildInputs(audioManifest, videoDurationMs, timeline) {
  if (!Array.isArray(audioManifest?.segments) || audioManifest.segments.length === 0) {
    throw new Error("Audio manifest must contain narration segments.");
  }
  if (!Number.isFinite(videoDurationMs) || videoDurationMs <= 0) {
    throw new Error("Raw video must have a positive duration.");
  }

  const timelineById = timeline === undefined
    ? null
    : new Map(
      timeline.map((entry) => {
        if (!entry?.id || !Number.isFinite(Number(entry.startMs))) {
          throw new Error("Timeline contains an invalid entry.");
        }
        return [entry.id, entry];
      }),
    );
  if (timelineById && timelineById.size !== timeline.length) {
    throw new Error("Timeline contains duplicate narration IDs.");
  }

  const ids = new Set();
  for (const segment of audioManifest.segments) {
    if (typeof segment?.id !== "string" || !segment.id) {
      throw new Error("Audio manifest contains a segment without an ID.");
    }
    if (ids.has(segment.id)) {
      throw new Error(`Audio manifest contains duplicate ID: ${segment.id}.`);
    }
    ids.add(segment.id);

    const startMs = Number(segment.startMs);
    const durationMs = Number(segment.durationMs);
    if (!Number.isFinite(startMs) || startMs < 0) {
      throw new Error(`Audio segment has an invalid start time: ${segment.id}.`);
    }
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error(`Audio segment has a non-positive duration: ${segment.id}.`);
    }
    if (startMs + durationMs > videoDurationMs) {
      throw new Error(`Audio segment exceeds raw video duration: ${segment.id}.`);
    }
    if (typeof segment.file !== "string" || !segment.file) {
      throw new Error(`Audio segment file is missing: ${segment.id}.`);
    }

    if (timelineById) {
      const timelineEntry = timelineById.get(segment.id);
      if (!timelineEntry) {
        throw new Error(`Timeline is missing audio ID: ${segment.id}.`);
      }
      if (Math.round(Number(timelineEntry.startMs)) !== Math.round(startMs)) {
        throw new Error(`Audio start time does not match timeline ID: ${segment.id}.`);
      }
      if (startMs + durationMs > Number(timelineEntry.endMs)) {
        throw new Error(`Narration audio exceeds its visible timeline step: ${segment.id}.`);
      }
    }
  }

  if (timelineById && timelineById.size !== ids.size) {
    const missing = [...timelineById.keys()].find((id) => !ids.has(id));
    throw new Error(`Audio manifest is missing timeline ID: ${missing}.`);
  }
  return audioManifest.segments;
}

export function buildNarrationFilter(segments, videoDurationMs) {
  const delayed = segments.map(
    (segment, index) =>
      `[${index}:a]adelay=${Math.round(segment.startMs)}|${Math.round(segment.startMs)}[a${index}]`,
  );
  const inputs = segments.map((_, index) => `[a${index}]`).join("");
  return `${delayed.join(";")};${inputs}amix=inputs=${segments.length}:duration=longest:dropout_transition=0:normalize=0,apad=whole_dur=${seconds(videoDurationMs)},atrim=duration=${seconds(videoDurationMs)}[narration]`;
}

export function buildSubtitleFilter(filename) {
  const escaped = filename
    .replaceAll("\\", "/")
    .replace(/^([A-Za-z]):/, "$1\\:")
    .replaceAll("'", String.raw`'\\\''`);
  return `subtitles=filename='${escaped}'`;
}

async function requireFile(filename, label) {
  const details = await stat(filename).catch(() => null);
  if (!details?.isFile() || details.size <= 0) {
    throw new Error(`${label} must be a non-empty file: ${filename}`);
  }
}

export function hasSubtitleFilter(result) {
  return /^\s*\.\.\.\s+subtitles\s+/m.test(
    `${result.stdout || ""}\n${result.stderr || ""}`,
  );
}

async function requireSubtitleFilter(ffmpeg) {
  const result = await run(ffmpeg, ["-hide_banner", "-filters"], {
    capture: true,
    quiet: true,
  });
  if (!hasSubtitleFilter(result)) {
    throw new Error("FFmpeg subtitle filter is unavailable; cannot burn subtitles.");
  }
}

export async function buildDemo(options = {}) {
  loadDemoEnv();
  const rawVideoPath = options.rawVideoPath || path.join(demoOutputDir, "raw-demo.webm");
  const timelinePath = options.timelinePath || path.join(demoOutputDir, "timeline.json");
  const audioManifestPath = options.audioManifestPath || path.join(demoOutputDir, "audio-manifest.json");
  const subtitlesPath = options.subtitlesPath || path.join(demoOutputDir, "subtitles.srt");
  const narrationPath = options.narrationPath || path.join(demoOutputDir, "narration.mp3");
  const voiceVideoPath = options.voiceVideoPath || path.join(demoOutputDir, "MVP-Demo-Voice.mp4");
  const finalVideoPath = options.finalVideoPath || path.join(demoOutputDir, "MVP-Demo.mp4");
  const burnSubtitles = options.burnSubtitles ?? process.env.DEMO_BURN_SUBTITLES !== "false";

  await requireFile(rawVideoPath, "Raw Playwright video");
  const rawProbe = await probeMedia(rawVideoPath);
  const videoDurationMs = Math.round(Number(rawProbe?.format?.duration) * 1000);
  const rawVideo = rawProbe?.streams?.find((stream) => stream.codec_type === "video");
  if (!rawVideo || !Number.isFinite(videoDurationMs) || videoDurationMs <= 0) {
    throw new Error("Raw Playwright video must contain video with a positive duration.");
  }

  const [audioManifest, timeline] = await Promise.all([
    readJson(audioManifestPath),
    readJson(timelinePath),
  ]);
  const segments = validateBuildInputs(audioManifest, videoDurationMs, timeline);
  const audioPaths = segments.map((segment) => path.resolve(demoOutputDir, segment.file));
  for (const [index, audioPath] of audioPaths.entries()) {
    await requireFile(audioPath, `Narration audio ${segments[index].id}`);
  }

  const ffmpeg = await resolveFfmpeg();
  await run(ffmpeg, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...audioPaths.flatMap((audioPath) => ["-i", audioPath]),
    "-filter_complex",
    buildNarrationFilter(segments, videoDurationMs),
    "-map",
    "[narration]",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "192k",
    narrationPath,
  ]);
  await requireFile(narrationPath, "Synchronized narration");

  await run(ffmpeg, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    rawVideoPath,
    "-i",
    narrationPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-crf",
    "18",
    "-preset",
    "medium",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    voiceVideoPath,
  ]);
  const expectedMedia = {
    expectedWidth: rawVideo.width,
    expectedHeight: rawVideo.height,
    expectedPixelFormat: "yuv420p",
    minimumDuration: 45,
    maximumDuration: 120,
  };
  const voiceVideo = await verifyFinalVideo(voiceVideoPath, expectedMedia);

  if (burnSubtitles) {
    await requireFile(subtitlesPath, "SRT subtitles");
    await requireSubtitleFilter(ffmpeg);
    await run(ffmpeg, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      voiceVideoPath,
      "-vf",
      buildSubtitleFilter(subtitlesPath),
      "-c:v",
      "libx264",
      "-crf",
      "18",
      "-preset",
      "medium",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "copy",
      finalVideoPath,
    ]);
  } else {
    await copyFile(voiceVideoPath, finalVideoPath);
  }
  const finalVideo = await verifyFinalVideo(finalVideoPath, expectedMedia);

  return {
    narrationPath,
    voiceVideoPath,
    finalVideoPath,
    voiceVideo,
    finalVideo,
    videoDurationMs,
  };
}

async function main() {
  const result = await buildDemo();
  console.log(
    `DEMO BUILT: ${path.relative(repositoryRoot, result.finalVideoPath)} (${result.finalVideo.duration.toFixed(2)}s)`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`DEMO BUILD FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
