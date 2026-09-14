import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOCKED_OPENAI_KEY_MESSAGE,
  audioDurationMsFromProbe,
  buildSrtCues,
  formatSrtTimestamp,
  requireOpenAiApiKey,
  segmentAudioFilename,
  validateNarrationTimeline,
} from "../../scripts/demo/narration.mjs";

const narration = {
  title: "MVP Demo",
  language: "vi",
  voice: "marin",
  segments: [
    { id: "intro", step: "Giới thiệu", text: "Chào mừng đến với EV Smart Gate." },
    { id: "login", step: "Đăng nhập", text: "Phiên vận hành an toàn đã sẵn sàng." },
  ],
};

const timeline = [
  { id: "intro", step: "Giới thiệu", startMs: 1200, endMs: 6200 },
  { id: "login", step: "Đăng nhập", startMs: 6200, endMs: 12000 },
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
        { ...narration, segments: [...narration.segments, narration.segments[0]] },
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
      text: "Chào mừng đến với EV Smart Gate.",
    },
    {
      index: 2,
      id: "login",
      startMs: 6200,
      endMs: 9550,
      text: "Phiên vận hành an toàn đã sẵn sàng.",
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
  assert.equal(audioDurationMsFromProbe({ format: { duration: "5.4321" } }), 5432);
  assert.throws(
    () => audioDurationMsFromProbe({ format: { duration: "0" } }),
    /positive duration/i,
  );
  assert.equal(segmentAudioFilename(0, "gate-entry"), "001-gate-entry.mp3");
  assert.throws(() => segmentAudioFilename(0, "../secret"), /safe segment ID/i);
});

test("TTS refuses to run without a real OpenAI API key", () => {
  assert.equal(requireOpenAiApiKey("  test-key  "), "test-key");
  assert.throws(
    () => requireOpenAiApiKey(""),
    (error) => error.message === BLOCKED_OPENAI_KEY_MESSAGE,
  );
});
