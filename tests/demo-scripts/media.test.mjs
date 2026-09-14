import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNarrationFilter,
  buildSubtitleFilter,
  hasSubtitleFilter,
  validateBuildInputs,
} from "../../scripts/demo/build-demo.mjs";

const audioManifest = {
  segments: [
    { id: "intro", file: "audio/001-intro.mp3", startMs: 1200, durationMs: 4200 },
    { id: "login", file: "audio/002-login.mp3", startMs: 6400, durationMs: 3800 },
  ],
};

test("narration filter delays every timeline segment and mixes all inputs", () => {
  assert.equal(
    buildNarrationFilter(audioManifest.segments, 12_000),
    "[0:a]adelay=1200|1200[a0];[1:a]adelay=6400|6400[a1];" +
      "[a0][a1]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0," +
      "apad=whole_dur=12,atrim=duration=12[narration]",
  );
});

test("media input validation rejects ambiguous IDs and audio beyond the video", () => {
  assert.doesNotThrow(() => validateBuildInputs(audioManifest, 12_000));
  assert.throws(
    () =>
      validateBuildInputs(
        { segments: [...audioManifest.segments, audioManifest.segments[0]] },
        12_000,
      ),
    /duplicate.*intro/i,
  );
  assert.throws(
    () =>
      validateBuildInputs(
        { segments: [{ ...audioManifest.segments[1], startMs: 11_000, durationMs: 2000 }] },
        12_000,
      ),
    /exceeds.*video/i,
  );
  assert.throws(
    () =>
      validateBuildInputs(audioManifest, 12_000, [
        { id: "intro", startMs: 1200, endMs: 5000 },
        { id: "login", startMs: 6400, endMs: 12_000 },
      ]),
    /audio exceeds.*visible timeline step.*intro/i,
  );
});

test("subtitle filter discovery accepts FFmpeg output from either stream", () => {
  const filters = " ... subtitles         V->V       Render text subtitles onto input video using the libass library.";
  assert.equal(hasSubtitleFilter({ stdout: filters, stderr: "" }), true);
  assert.equal(hasSubtitleFilter({ stdout: "", stderr: filters }), true);
  assert.equal(hasSubtitleFilter({ stdout: "", stderr: "no subtitle filter" }), false);
});

test("subtitle filter safely escapes Windows paths for FFmpeg", () => {
  assert.equal(
    buildSubtitleFilter("D:\\ev-smart-gate\\dist\\demo\\subtitles.srt"),
    "subtitles=filename='D\\:/ev-smart-gate/dist/demo/subtitles.srt'",
  );
  assert.equal(
    buildSubtitleFilter("dist/demo/customer's-demo.srt"),
    String.raw`subtitles=filename='dist/demo/customer'\\\''s-demo.srt'`,
  );
});
