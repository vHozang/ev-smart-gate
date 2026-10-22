import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  discoverSingleRunArtifact,
  validateRunnerEnvironment,
} from "../../scripts/demo/run-demo.mjs";

async function withFixture(action) {
  const root = await mkdtemp(path.join(os.tmpdir(), "smart-gate-runner-"));
  try {
    await action(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("runner selects exactly one artifact created by the current run", async () => {
  await withFixture(async (root) => {
    const oldDirectory = path.join(root, "old");
    const newDirectory = path.join(root, "new");
    await Promise.all([mkdir(oldDirectory), mkdir(newDirectory)]);
    const stale = path.join(oldDirectory, "video.webm");
    const fresh = path.join(newDirectory, "video.webm");
    await Promise.all([writeFile(stale, "old"), writeFile(fresh, "new")]);
    await utimes(stale, new Date(1000), new Date(1000));

    assert.equal(
      await discoverSingleRunArtifact(root, "video.webm", 2000),
      fresh,
    );
  });
});

test("runner rejects missing or ambiguous current-run artifacts", async () => {
  await withFixture(async (root) => {
    await assert.rejects(
      discoverSingleRunArtifact(root, "video.webm", Date.now()),
      /expected exactly one current-run video\.webm; found 0/i,
    );

    await Promise.all([
      mkdir(path.join(root, "a")),
      mkdir(path.join(root, "b")),
    ]);
    await Promise.all([
      writeFile(path.join(root, "a", "video.webm"), "a"),
      writeFile(path.join(root, "b", "video.webm"), "b"),
    ]);
    await assert.rejects(
      discoverSingleRunArtifact(root, "video.webm", 0),
      /expected exactly one current-run video\.webm; found 2/i,
    );
  });
});

test("runner validates final-deliverable requirements before destructive output cleanup", () => {
  const baseEnvironment = { DEMO_BASE_URL: "http://localhost:8000" };
  assert.doesNotThrow(() =>
    validateRunnerEnvironment({ ...baseEnvironment }),
  );
  assert.throws(
    () =>
      validateRunnerEnvironment({
        ...baseEnvironment,
        DEMO_BURN_SUBTITLES: "false",
      }),
    /DEMO_BURN_SUBTITLES must be true for the final MVP demo\./,
  );
  assert.throws(
    () =>
      validateRunnerEnvironment({
        ...baseEnvironment,
        DEMO_BASE_URL: "https://production.example.com",
      }),
    /DEMO_BASE_URL must use a local HTTP loopback address\./,
  );
  assert.throws(
    () =>
      validateRunnerEnvironment({
        ...baseEnvironment,
        DEMO_CAMERA_URL: "https://camera.example.com",
      }),
    /DEMO_CAMERA_URL must use a local HTTP loopback address\./,
  );
});
