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
const cardUid = "DEMO-CARD-UID-MUST-NOT-SURVIVE";
const newCardUid = "DEMO-NEW-CARD-UID-MUST-NOT-SURVIVE";

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
    {
      type: "resource-snapshot",
      snapshot: {
        request: {
          url: "http://localhost/api/v1/employee-cards",
          headers: [
            { name: "cookie", value: `session=${cookie}` },
            { name: "x-csrf-token", value: csrf },
          ],
          postData: {
            mimeType: "application/json",
            text: JSON.stringify({ driver_id: "driver-1", card_uid: cardUid }),
            _file: "resources/card-body",
          },
        },
        response: {
          headers: [],
        },
      },
    },
    {
      type: "resource-snapshot",
      snapshot: {
        request: {
          url: "http://localhost/api/v1/gate/entry",
          headers: [
            { name: "cookie", value: `session=${cookie}` },
          ],
          postData: {
            mimeType: "multipart/form-data; boundary=----WebKitFormBoundary123",
            text: `------WebKitFormBoundary123\r\nContent-Disposition: form-data; name="card_uid"\r\n\r\n${cardUid}\r\n------WebKitFormBoundary123--`,
          },
        },
        response: {
          headers: [],
        },
      },
    },
    {
      type: "resource-snapshot",
      snapshot: {
        request: {
          url: "http://localhost/api/v1/cards/validate",
          headers: [
            { name: "cookie", value: `session=${cookie}` },
            { name: "content-type", value: "application/x-www-form-urlencoded" },
          ],
          postData: {
            mimeType: "application/x-www-form-urlencoded",
            text: `card_uid=${cardUid}&driver_id=driver-1`,
            _file: "resources/urlencoded-body",
          },
        },
        response: {
          headers: [],
        },
      },
    },
    {
      type: "resource-snapshot",
      snapshot: {
        request: {
          url: "http://localhost/api/v1/employee-cards/camel",
          headers: [
            { name: "cookie", value: `session=${cookie}` },
          ],
          postData: {
            mimeType: "application/json",
            text: JSON.stringify({ cardUid, driverId: "driver-1" }),
            _file: "resources/camel-body",
          },
        },
        response: {
          headers: [],
        },
      },
    },
    {
      type: "resource-snapshot",
      snapshot: {
        request: {
          url: "http://localhost/api/v1/employee-cards/replace",
          headers: [
            { name: "cookie", value: `session=${cookie}` },
          ],
          postData: {
            mimeType: "application/json",
            text: JSON.stringify({ old_card_uid: cardUid, new_card_uid: newCardUid }),
            _file: "resources/replace-snake-body",
          },
        },
        response: {
          headers: [],
        },
      },
    },
    {
      type: "resource-snapshot",
      snapshot: {
        request: {
          url: "http://localhost/api/v1/employee-cards/replace-camel",
          headers: [
            { name: "cookie", value: `session=${cookie}` },
          ],
          postData: {
            mimeType: "application/json",
            text: JSON.stringify({ oldCardUid: cardUid, newCardUid: newCardUid }),
            _file: "resources/replace-camel-body",
          },
        },
        response: {
          headers: [],
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
      type: "before",
      params: { arg: { value: cardUid } },
      title: "page.evaluate",
    },
    {
      class: "Frame",
      method: "evaluateExpression",
      params: { arg: { value: { s: cardUid } } },
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
      type: "frame-snapshot",
      snapshot: {
        html: [
          "INPUT",
          {
            name: "card_uid",
            type: "password",
            value: cardUid,
            __playwright_value_: cardUid,
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
    "resources/card-body": strToU8(
      JSON.stringify({
        driver_id: "driver-1",
        card_uid: cardUid,
      }),
    ),
    "resources/urlencoded-body": strToU8(`card_uid=${cardUid}&driver_id=driver-1`),
    "resources/camel-body": strToU8(
      JSON.stringify({
        cardUid,
        driverId: "driver-1",
      }),
    ),
    "resources/replace-snake-body": strToU8(
      JSON.stringify({
        old_card_uid: cardUid,
        new_card_uid: newCardUid,
      }),
    ),
    "resources/replace-camel-body": strToU8(
      JSON.stringify({
        oldCardUid: cardUid,
        newCardUid: newCardUid,
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
      secrets: [password, cookie, csrf, unconfiguredDomPassword, cardUid, newCardUid],
    });

    const archive = unzipSync(new Uint8Array(await readFile(filename)));
    const allText = Object.values(archive).map((value) => strFromU8(value)).join("\n");
    assert.doesNotMatch(allText, new RegExp(password));
    assert.doesNotMatch(allText, new RegExp(cookie));
    assert.doesNotMatch(allText, new RegExp(csrf));
    assert.doesNotMatch(allText, new RegExp(unconfiguredDomPassword));
    assert.doesNotMatch(allText, new RegExp(cardUid));
    assert.doesNotMatch(allText, new RegExp(newCardUid));
    assert.match(allText, /\[REDACTED\]/);
    assert.match(allText, /driver-vehicle-authorizations/);
    assert.match(allText, /driver-1/);

    const traceEvents = strFromU8(archive["1-trace.trace"])
      .split("\n")
      .filter(Boolean)
      .map(JSON.parse);
    const contextOptionsEvent = traceEvents.find((e) => e.type === "context-options");
    const storageState = contextOptionsEvent.options.storageState;
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

test("trace safety validation rejects unsanitized URL-encoded resource", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "smart-gate-trace-"));
  const filename = path.join(directory, "trace.zip");
  try {
    // Create archive with sanitized trace/network but unsanitized URL-encoded resource
    const trace = [{ type: "context-options", options: {} }];
    const network = [{ type: "resource-snapshot", snapshot: { request: { url: "http://localhost" }, response: {} } }];
    await writeFile(filename, zipSync({
      "1-trace.trace": strToU8(trace.map(JSON.stringify).join("\n")),
      "1-trace.network": strToU8(network.map(JSON.stringify).join("\n")),
      "resources/form-body": strToU8(`card_uid=LEAKED-SECRET&driver_id=driver-1`),
    }));
    await assert.rejects(
      assertSafeTraceArchive(filename, { secrets: [] }),
      /sensitive trace data/i,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("trace safety validation rejects partially redacted URL-encoded values", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "smart-gate-trace-"));
  const filename = path.join(directory, "trace.zip");
  try {
    const trace = [{ type: "context-options", options: {} }];
    const network = [{ type: "resource-snapshot", snapshot: { request: { url: "http://localhost" }, response: {} } }];
    await writeFile(filename, zipSync({
      "1-trace.trace": strToU8(trace.map(JSON.stringify).join("\n")),
      "1-trace.network": strToU8(network.map(JSON.stringify).join("\n")),
      "resources/partial-body": strToU8(`card_uid=[REDACTED]LEAKED-RAW-DATA&driver_id=driver-1`),
    }));
    await assert.rejects(
      assertSafeTraceArchive(filename, { secrets: [] }),
      /sensitive trace data/i,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
