import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import {
  assertSafeTraceArchive,
  sanitizeTraceArchive,
} from "../../scripts/demo/security.mjs";
import { runPlaywrightDemo } from "../../scripts/demo/run-playwright.mjs";

const password = "local-password-must-not-survive";
const cookie = "session-cookie-must-not-survive";
const csrf = "csrf-token-must-not-survive";
const unconfiguredDomPassword = "unconfigured-dom-password-must-not-survive";

function archiveFixture() {
  const network = [
    {
      type: "resource-snapshot",
      snapshot: {
        request: {
          url: "http://localhost/api/v1/auth/login",
          headers: [
            { name: "cookie", value: `session=${cookie}` },
            { name: "x-csrf-token", value: csrf },
          ],
          postData: {
            mimeType: "application/json",
            text: JSON.stringify({ username: "admin", password }),
            _file: "resources/login-body",
          },
        },
        response: {
          headers: [{ name: "set-cookie", value: `session=${cookie}; HttpOnly` }],
        },
      },
    },
  ];
  const trace = [
    {
      type: "before",
      params: { arg: { value: password } },
      title: "Evaluate",
    },
    {
      type: "frame-snapshot",
      snapshot: {
        html: [
          "INPUT",
          {
            type: "password",
            value: unconfiguredDomPassword,
            __playwright_value_: unconfiguredDomPassword,
          },
        ],
      },
    },
    {
      type: "context-options",
      options: {
        storageState: {
          cookies: [{ name: "smart_gate_session", value: cookie, domain: "localhost" }],
          origins: [
            {
              origin: "http://localhost",
              localStorage: [
                { name: "csrf_token", value: csrf },
                { name: "theme", value: "dark" },
              ],
            },
          ],
        },
      },
    },
  ];
  return zipSync({
    "1-trace.trace": strToU8(trace.map(JSON.stringify).join("\n")),
    "1-trace.network": strToU8(network.map(JSON.stringify).join("\n")),
    "resources/login-body": strToU8(
      JSON.stringify({
        username: "admin",
        password,
        csrf_token: csrf,
        business_path: "/driver-vehicle-authorizations",
      }),
    ),
  });
}

test("trace sanitizer removes secrets while preserving useful business trace data", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "smart-gate-trace-"));
  const filename = path.join(directory, "trace.zip");
  try {
    await writeFile(filename, archiveFixture());
    await sanitizeTraceArchive(filename, { secrets: [password] });
    await assertSafeTraceArchive(filename, {
      secrets: [password, cookie, csrf, unconfiguredDomPassword],
    });

    const archive = unzipSync(new Uint8Array(await readFile(filename)));
    const allText = Object.values(archive).map((value) => strFromU8(value)).join("\n");
    assert.doesNotMatch(allText, new RegExp(password));
    assert.doesNotMatch(allText, new RegExp(cookie));
    assert.doesNotMatch(allText, new RegExp(csrf));
    assert.doesNotMatch(allText, new RegExp(unconfiguredDomPassword));
    assert.match(allText, /\[REDACTED\]/);
    assert.match(allText, /driver-vehicle-authorizations/);

    const traceEvents = strFromU8(archive["1-trace.trace"])
      .split("\n")
      .filter(Boolean)
      .map(JSON.parse);
    const storageState = traceEvents[2].options.storageState;
    assert.deepEqual(storageState.cookies, [
      { name: "smart_gate_session", value: "[REDACTED]", domain: "localhost" },
    ]);
    assert.deepEqual(storageState.origins[0].localStorage, [
      { name: "csrf_token", value: "[REDACTED]" },
      { name: "theme", value: "dark" },
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Playwright wrapper sanitizes artifacts even when the test command fails", async () => {
  const calls = [];
  const expectedFailure = new Error("playwright failed");
  await assert.rejects(
    runPlaywrightDemo({
      runCommand: async () => {
        calls.push("run");
        throw expectedFailure;
      },
      sanitize: async () => calls.push("sanitize"),
      scan: async () => calls.push("scan"),
      secrets: [password],
      roots: ["results", "report"],
    }),
    (error) => error === expectedFailure,
  );
  assert.deepEqual(calls, ["run", "sanitize", "scan"]);
});

test("trace safety validation rejects unsanitized archives", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "smart-gate-trace-"));
  const filename = path.join(directory, "trace.zip");
  try {
    await writeFile(filename, archiveFixture());
    await assert.rejects(
      assertSafeTraceArchive(filename, { secrets: [password] }),
      /sensitive trace data/i,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
