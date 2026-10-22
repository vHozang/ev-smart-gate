import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  readJson,
  requireLocalHttpUrl,
  resolveFfmpeg,
  resolveFfprobe,
  validateProbeData,
} from "../../scripts/demo/utils.mjs";

test("readJson rejects malformed JSON with the file path", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "smart-gate-json-"));
  const filename = path.join(directory, "broken.json");
  await writeFile(filename, "{broken", "utf8");

  await assert.rejects(readJson(filename), new RegExp(filename.replaceAll("\\", "\\\\")));
  await rm(directory, { recursive: true, force: true });
});

test("demo endpoints must use local HTTP loopback addresses", () => {
  assert.equal(
    requireLocalHttpUrl("http://localhost:8000", "DEMO_BASE_URL"),
    "http://localhost:8000/",
  );
  assert.equal(
    requireLocalHttpUrl("http://127.0.0.1:18081", "DEMO_CAMERA_URL"),
    "http://127.0.0.1:18081/",
  );
  assert.throws(
    () => requireLocalHttpUrl("https://production.example.com", "DEMO_BASE_URL"),
    /local HTTP loopback/i,
  );
  assert.throws(
    () => requireLocalHttpUrl("http://user:secret@localhost:8000", "DEMO_BASE_URL"),
    /local HTTP loopback/i,
  );
});

test("media executable resolvers return runnable local or system tools", async () => {
  assert.match(await resolveFfmpeg(), /ffmpeg(?:\.exe)?$/i);
  assert.match(await resolveFfprobe(), /ffprobe(?:\.exe)?$/i);
});

test("validateProbeData requires a positive H.264 video and AAC audio", () => {
  const valid = {
    format: { duration: "52.75" },
    streams: [
      {
        codec_type: "video",
        codec_name: "h264",
        pix_fmt: "yuv420p",
        width: 1440,
        height: 900,
      },
      { codec_type: "audio", codec_name: "aac" },
    ],
  };

  assert.deepEqual(validateProbeData(valid), {
    duration: 52.75,
    videoCodec: "h264",
    audioCodec: "aac",
    width: 1440,
    height: 900,
    pixelFormat: "yuv420p",
  });
  assert.doesNotThrow(() =>
    validateProbeData(valid, { minimumDuration: 45, maximumDuration: 120 }),
  );
  assert.throws(
    () => validateProbeData({ ...valid, streams: valid.streams.slice(0, 1) }),
    /AAC audio stream/,
  );
  assert.throws(
    () => validateProbeData({ ...valid, format: { duration: "0" } }),
    /positive duration/,
  );
  assert.throws(
    () =>
      validateProbeData(
        {
          ...valid,
          streams: [{ ...valid.streams[0], pix_fmt: "yuv444p" }, valid.streams[1]],
        },
        { expectedPixelFormat: "yuv420p" },
      ),
    /pixel format.*yuv420p/i,
  );
  assert.throws(
    () => validateProbeData(valid, { minimumDuration: 60 }),
    /at least 60 seconds/i,
  );
  assert.throws(
    () => validateProbeData(valid, { maximumDuration: 50 }),
    /at most 50 seconds/i,
  );
});
