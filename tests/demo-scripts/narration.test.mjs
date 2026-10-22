import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  audioDurationMsFromProbe,
  buildSrtCues,
  formatSrtTimestamp,
  segmentAudioFilename,
  validateNarrationTimeline,
} from "../../scripts/demo/narration.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, "../..");

const expectedIds = [
  "intro",
  "login",
  "identity-registration",
  "card-issuance",
  "card-replacement",
  "gate-entry",
  "safe-rejection",
  "gate-exit",
  "history",
  "success",
];

test("narration manifest uses parking segments with correct IDs, language and voice", async () => {
  const narrationPath = path.join(repositoryRoot, "demo", "narration.json");
  const narration = JSON.parse(await readFile(narrationPath, "utf8"));

  // Exact ordered IDs from Task 8
  assert.deepEqual(
    narration.segments.map((s) => s.id),
    expectedIds,
  );

  // Language and Edge TTS voice
  assert.equal(narration.language, "vi");
  assert.equal(narration.voice, "vi-VN-HoaiMyNeural");

  // No warehouse copy in any step or text
  const allText = narration.segments
    .map((s) => `${s.step} ${s.text}`)
    .join(" ");
  assert.doesNotMatch(
    allText,
    /xuất kho|lệnh kho|quy trình kho|dock|kiểm hàng|Exit Slip|QR/i,
  );

  // Contains parking domain concepts
  assert.match(allText, /bãi xe|barrier|thẻ|khuôn mặt|biển số/i);
});

// Fixtures using first two parking segments for unit-level narration tests
const narration = {
  title: "EV Smart Gate — MVP Demo",
  language: "vi",
  voice: "vi-VN-HoaiMyNeural",
  segments: [
    {
      id: "intro",
      step: "Mở trung tâm kiểm soát bãi xe EV Smart Gate",
      text: "EV Smart Gate tập trung vào kiểm soát bãi xe ra vào bằng ba yếu tố độc lập.",
    },
    {
      id: "login",
      step: "Đăng nhập bằng phiên vận hành an toàn",
      text: "Quản trị viên đăng nhập bằng phiên vận hành được bảo vệ.",
    },
  ],
};

const timeline = [
  {
    id: "intro",
    step: "Mở trung tâm kiểm soát bãi xe EV Smart Gate",
    startMs: 1200,
    endMs: 6200,
  },
  {
    id: "login",
    step: "Đăng nhập bằng phiên vận hành an toàn",
    startMs: 6200,
    endMs: 12000,
  },
];

const audioManifest = {
  segments: [
    { id: "intro", file: "audio/001-intro.mp3", durationMs: 4800 },
    { id: "login", file: "audio/002-login.mp3", durationMs: 3100 },
  ],
};

test("narration IDs map one-to-one to timeline IDs", () => {
  assert.deepEqual(
    validateNarrationTimeline(narration, timeline).map((entry) => entry.id),
    ["intro", "login"],
  );

  assert.throws(
    () =>
      validateNarrationTimeline(
        { ...narration, segments: narration.segments.slice(0, 1) },
        timeline,
      ),
    /missing.*login/i,
  );
  assert.throws(
    () =>
      validateNarrationTimeline(
        {
          ...narration,
          segments: [...narration.segments, narration.segments[0]],
        },
        timeline,
      ),
    /duplicate.*intro/i,
  );
  assert.throws(
    () =>
      validateNarrationTimeline(
        {
          ...narration,
          segments: [
            { ...narration.segments[0], step: "Cảnh không đúng" },
            narration.segments[1],
          ],
        },
        timeline,
      ),
    /step does not match.*intro/i,
  );
});

test("SRT cues use actual timing, exact text, and never overlap", () => {
  assert.equal(formatSrtTimestamp(3_726_045), "01:02:06,045");

  const cues = buildSrtCues(narration, timeline, audioManifest);
  assert.deepEqual(cues, [
    {
      index: 1,
      id: "intro",
      startMs: 1200,
      endMs: 6199,
      text: "EV Smart Gate tập trung vào kiểm soát bãi xe ra vào bằng ba yếu tố độc lập.",
    },
    {
      index: 2,
      id: "login",
      startMs: 6200,
      endMs: 9550,
      text: "Quản trị viên đăng nhập bằng phiên vận hành được bảo vệ.",
    },
  ]);
  assert.ok(cues[0].endMs < cues[1].startMs);
  assert.ok(cues.every((cue, index) => cue.endMs <= timeline[index].endMs));
  const sceneBounded = buildSrtCues(narration, timeline, {
    segments: [
      audioManifest.segments[0],
      { ...audioManifest.segments[1], durationMs: 5800 },
    ],
  });
  assert.equal(sceneBounded[1].endMs, timeline[1].endMs);

  assert.throws(
    () =>
      buildSrtCues(narration, timeline, {
        segments: [
          { id: "intro", file: "audio/001-intro.mp3", durationMs: 5001 },
          audioManifest.segments[1],
        ],
      }),
    /audio exceeds.*visible timeline step.*intro/i,
  );
});

test("audio metadata uses positive ffprobe duration and safe filenames", () => {
  assert.equal(
    audioDurationMsFromProbe({ format: { duration: "5.4321" } }),
    5432,
  );
  assert.throws(
    () => audioDurationMsFromProbe({ format: { duration: "0" } }),
    /positive duration/i,
  );
  assert.equal(segmentAudioFilename(0, "gate-entry"), "001-gate-entry.mp3");
  assert.throws(
    () => segmentAudioFilename(0, "../secret"),
    /safe segment ID/i,
  );
});

test("Edge TTS engine is available and configurable", async () => {
  // Edge TTS replaces OpenAI TTS — verify the engine is importable
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const { EdgeTTS } = require("node-edge-tts");
  assert.equal(typeof EdgeTTS, "function", "EdgeTTS constructor must be available");
  // Verify it can be instantiated with Vietnamese voice
  const tts = new EdgeTTS({ voice: "vi-VN-HoaiMyNeural", lang: "vi-VN" });
  assert.ok(tts, "EdgeTTS instance must be created");
});
