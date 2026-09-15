import { constants as fsConstants } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

export const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const demoOutputDir = path.join(repositoryRoot, "dist", "demo");
export const playwrightOutputDir = path.join(repositoryRoot, ".playwright", "demo-results");

export function loadDemoEnv() {
  dotenv.config({ path: path.join(repositoryRoot, ".env.example"), quiet: true });
  dotenv.config({
    path: path.join(repositoryRoot, ".env"),
    override: true,
    quiet: true,
  });
  process.env.DEMO_BASE_URL ||= "http://localhost:8000";
  process.env.DEMO_LANGUAGE ||= "vi";
  process.env.DEMO_BURN_SUBTITLES ||= "true";
  process.env.DEMO_INTRO_MS ||= "1200";
  process.env.DEMO_OUTRO_MS ||= "1800";
  return process.env;
}

export function requireLocalHttpUrl(value, name) {
  const configured = value?.trim();
  if (!configured) throw new Error(`${name} must be configured.`);
  let url;
  try {
    url = new URL(configured);
  } catch (error) {
    throw new Error(`${name} must be a valid URL.`, { cause: error });
  }
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (
    url.protocol !== "http:" ||
    !loopbackHosts.has(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error(`${name} must use a local HTTP loopback address.`);
  }
  return url.toString();
}

export async function ensureDir(directory) {
  await mkdir(directory, { recursive: true });
}

export async function resetGeneratedArtifacts() {
  await rm(demoOutputDir, { recursive: true, force: true });
  await rm(playwrightOutputDir, { recursive: true, force: true });
  await ensureDir(demoOutputDir);
}

export async function readJson(filename) {
  try {
    return JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read valid JSON from ${filename}: ${error.message}`, {
      cause: error,
    });
  }
}

export async function writeJson(filename, value) {
  await ensureDir(path.dirname(filename));
  const temporary = `${filename}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rm(filename, { force: true });
  await import("node:fs/promises").then(({ rename }) => rename(temporary, filename));
}

async function executableExists(filename) {
  if (!filename) return false;
  try {
    await access(filename, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function commandName(name) {
  return process.platform === "win32" ? `${name}.exe` : name;
}

async function systemExecutable(name) {
  const command = process.platform === "win32" ? "where.exe" : "which";
  try {
    const result = await run(command, [name], { capture: true, quiet: true });
    return result.stdout.split(/\r?\n/).find(Boolean) || null;
  } catch {
    return null;
  }
}

export async function resolveFfmpeg() {
  const fromPath = await systemExecutable("ffmpeg");
  if (fromPath) return fromPath;
  if (await executableExists(ffmpegStatic)) return ffmpegStatic;
  throw new Error(
    `FFmpeg is unavailable. Install ${commandName("ffmpeg")} or reinstall ffmpeg-static.`,
  );
}

export async function resolveFfprobe() {
  const fromPath = await systemExecutable("ffprobe");
  if (fromPath) return fromPath;
  const candidate = ffprobeStatic?.path;
  if (await executableExists(candidate)) return candidate;
  throw new Error(
    `ffprobe is unavailable. Install ${commandName("ffprobe")} or reinstall ffprobe-static.`,
  );
}

export function run(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || repositoryRoot,
      env: { ...process.env, ...(options.env || {}) },
      shell: false,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    if (options.capture) {
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (!options.quiet) process.stdout.write(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
        if (!options.quiet) process.stderr.write(chunk);
      });
    }
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve({ code, signal, stdout, stderr });
        return;
      }
      reject(
        new Error(
          `${path.basename(command)} exited with ${code ?? signal}${stderr ? `: ${stderr.trim()}` : ""}`,
        ),
      );
    });
  });
}

export async function probeMedia(filename) {
  const probe = await resolveFfprobe();
  const result = await run(
    probe,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=index,codec_type,codec_name,pix_fmt,width,height,duration",
      "-of",
      "json",
      filename,
    ],
    { capture: true, quiet: true },
  );
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`ffprobe returned invalid JSON for ${filename}`, { cause: error });
  }
}

export function validateProbeData(probeData, options = {}) {
  const duration = Number(probeData?.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Media must have a positive duration.");
  }
  const video = probeData.streams?.find((stream) => stream.codec_type === "video");
  if (!video || video.codec_name !== "h264") {
    throw new Error("Media must contain an H.264 video stream.");
  }
  const audio = probeData.streams?.find((stream) => stream.codec_type === "audio");
  if (!audio || audio.codec_name !== "aac") {
    throw new Error("Media must contain an AAC audio stream.");
  }
  if (
    options.expectedWidth &&
    options.expectedHeight &&
    (video.width !== options.expectedWidth || video.height !== options.expectedHeight)
  ) {
    throw new Error(
      `Media resolution must be ${options.expectedWidth}x${options.expectedHeight}; got ${video.width}x${video.height}.`,
    );
  }
  if (options.expectedPixelFormat && video.pix_fmt !== options.expectedPixelFormat) {
    throw new Error(
      `Media pixel format must be ${options.expectedPixelFormat}; got ${video.pix_fmt || "unknown"}.`,
    );
  }
  if (options.minimumDuration && duration < options.minimumDuration) {
    throw new Error(`Media duration must be at least ${options.minimumDuration} seconds.`);
  }
  if (options.maximumDuration && duration > options.maximumDuration) {
    throw new Error(`Media duration must be at most ${options.maximumDuration} seconds.`);
  }
  return {
    duration,
    videoCodec: video.codec_name,
    audioCodec: audio.codec_name,
    width: video.width,
    height: video.height,
    pixelFormat: video.pix_fmt,
  };
}

export async function verifyFinalVideo(filename, options = {}) {
  const fileStats = await stat(filename).catch(() => null);
  if (!fileStats?.isFile() || fileStats.size <= 0) {
    throw new Error(`Expected non-empty video file: ${filename}`);
  }
  const metadata = validateProbeData(await probeMedia(filename), options);
  return { ...metadata, sizeBytes: fileStats.size, path: filename };
}

export function parsePositiveMilliseconds(value, name) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new Error(`${name} must be a non-negative number of milliseconds.`);
  }
  return Math.round(milliseconds);
}
