import { readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const redacted = "[REDACTED]";
const sensitiveHeaderNames = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
  "x-api-key",
  "x-csrf-token",
  "x-device-key",
]);
const sensitiveKeys = new Set([
  "access_token",
  "api_key",
  "apikey",
  "authorization",
  "cookie",
  "csrf",
  "csrf_token",
  "device_api_key",
  "edge_device_key",
  "embedding_encryption_key",
  "evidence_encryption_key",
  "minio_secret_key",
  "openai_api_key",
  "password",
  "passwd",
  "passphrase",
  "private_key",
  "qr_private_key",
  "refresh_token",
  "secret",
  "session",
  "session_id",
  "session_secret",
  "session_token",
  "set-cookie",
  "token",
  "x-api-key",
  "x-csrf-token",
  "x-device-key",
]);
const configuredSecretNames = [
  "ADMIN_PASSWORD",
  "OPENAI_API_KEY",
  "SESSION_SECRET",
  "DEVICE_API_KEY",
  "EDGE_DEVICE_KEY",
  "MINIO_SECRET_KEY",
  "EMBEDDING_ENCRYPTION_KEY",
  "EVIDENCE_ENCRYPTION_KEY",
  "QR_PRIVATE_KEY",
];

function normalizedSecrets(values = []) {
  return [...new Set(values.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean))];
}

export function collectConfiguredSecrets(environment = process.env) {
  return normalizedSecrets(configuredSecretNames.map((name) => environment[name]));
}

function isSensitiveKey(value) {
  const name = String(value || "").trim().toLowerCase().replaceAll("-", "_");
  return sensitiveKeys.has(name) || /(?:^|_)(?:password|passwd|secret|token|cookie)(?:$|_)/.test(name);
}

function isSensitiveValueName(value) {
  const name = String(value || "").trim().toLowerCase().replaceAll("-", "_");
  return isSensitiveKey(name) || /(?:^|_)(?:auth|csrf|session)(?:$|_)/.test(name);
}

function redactString(value, secrets) {
  let result = value;
  for (const secret of secrets) result = result.replaceAll(secret, redacted);
  result = result.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${redacted}`);
  return result;
}

function sanitizeValue(value, secrets) {
  if (typeof value === "string") return redactString(value, secrets);
  if (Array.isArray(value)) return value.map((entry) => sanitizeValue(entry, secrets));
  if (!value || typeof value !== "object") return value;

  const result = {};
  const namedSensitiveValue = isSensitiveValueName(value.name);
  const passwordInput = String(value.type || "").toLowerCase() === "password";
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replaceAll("-", "_");
    if (
      isSensitiveKey(normalizedKey) ||
      (key === "value" && (namedSensitiveValue || passwordInput)) ||
      (key === "__playwright_value_" && passwordInput)
    ) {
      result[key] = redacted;
    } else if (
      key === "value" &&
      sensitiveHeaderNames.has(String(value.name || "").toLowerCase())
    ) {
      result[key] = redacted;
    } else {
      result[key] = sanitizeValue(entry, secrets);
    }
  }
  return result;
}

function sanitizeJsonLines(text, secrets) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (!line.trim()) return line;
      try {
        return JSON.stringify(sanitizeValue(JSON.parse(line), secrets));
      } catch {
        return redactString(line, secrets);
      }
    })
    .join("\n");
}

function decodeUtf8(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function sanitizeArchiveEntry(name, bytes, secrets) {
  const text = decodeUtf8(bytes);
  if (text === null) return bytes;
  if (name.endsWith(".trace") || name.endsWith(".network")) {
    return strToU8(sanitizeJsonLines(text, secrets));
  }
  try {
    return strToU8(JSON.stringify(sanitizeValue(JSON.parse(text), secrets)));
  } catch {
    return strToU8(redactString(text, secrets));
  }
}

function traceEntries(archive) {
  return Object.keys(archive).filter(
    (name) => name.endsWith(".trace") || name.endsWith(".network"),
  );
}

function findSensitiveValue(value, location = "$", findings = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findSensitiveValue(entry, `${location}[${index}]`, findings));
    return findings;
  }
  if (!value || typeof value !== "object") return findings;

  const namedSensitiveValue = isSensitiveValueName(value.name);
  const passwordInput = String(value.type || "").toLowerCase() === "password";
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replaceAll("-", "_");
    const shouldBeRedacted =
      isSensitiveKey(normalizedKey) ||
      (key === "value" && namedSensitiveValue) ||
      (key === "__playwright_value_" && passwordInput) ||
      (key === "value" && sensitiveHeaderNames.has(String(value.name || "").toLowerCase()));
    if (shouldBeRedacted && entry !== redacted) findings.push(`${location}.${key}`);
    else findSensitiveValue(entry, `${location}.${key}`, findings);
  }
  return findings;
}

function inspectEntry(name, bytes, secrets) {
  const body = Buffer.from(bytes);
  for (const secret of secrets) {
    if (body.includes(Buffer.from(secret))) return [`${name}:configured-secret`];
  }
  const text = decodeUtf8(bytes) ?? "";
  if (/Bearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]+/i.test(text)) {
    return [`${name}:bearer-token`];
  }

  const findings = [];
  const lines = name.endsWith(".trace") || name.endsWith(".network")
    ? text.split(/\r?\n/).filter(Boolean)
    : text.trim().startsWith("{") || text.trim().startsWith("[")
      ? [text]
      : [];
  for (const [index, line] of lines.entries()) {
    try {
      findSensitiveValue(JSON.parse(line), `${name}:${index + 1}`, findings);
    } catch {
      // Non-JSON response bodies are still checked against configured secrets above.
    }
  }
  return findings;
}

export async function sanitizeTraceArchive(filename, options = {}) {
  const secrets = normalizedSecrets(options.secrets);
  const archive = unzipSync(new Uint8Array(await readFile(filename)));
  if (traceEntries(archive).length === 0) {
    throw new Error(`ZIP is not a Playwright trace archive: ${filename}`);
  }
  const sanitized = {};
  for (const [name, bytes] of Object.entries(archive)) {
    sanitized[name] = sanitizeArchiveEntry(name, bytes, secrets);
  }
  const temporary = `${filename}.sanitized.tmp`;
  await writeFile(temporary, zipSync(sanitized, { level: 6 }));
  await rm(filename, { force: true });
  await rename(temporary, filename);
  await assertSafeTraceArchive(filename, { secrets });
  return filename;
}

export async function assertSafeTraceArchive(filename, options = {}) {
  const secrets = normalizedSecrets(options.secrets);
  const archive = unzipSync(new Uint8Array(await readFile(filename)));
  if (traceEntries(archive).length === 0) {
    throw new Error(`ZIP is not a Playwright trace archive: ${filename}`);
  }
  const findings = Object.entries(archive).flatMap(([name, bytes]) =>
    inspectEntry(name, bytes, secrets),
  );
  if (findings.length > 0) {
    throw new Error(`Sensitive trace data remains in ${filename}: ${findings[0]}`);
  }
  return filename;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(filename));
    else if (entry.isFile()) files.push(filename);
  }
  return files;
}

export async function sanitizeTraceArtifacts(roots, options = {}) {
  const sanitized = [];
  for (const root of roots) {
    for (const filename of await walk(root)) {
      if (path.extname(filename).toLowerCase() !== ".zip") continue;
      try {
        const archive = unzipSync(new Uint8Array(await readFile(filename)));
        if (traceEntries(archive).length === 0) continue;
      } catch {
        continue;
      }
      await sanitizeTraceArchive(filename, options);
      sanitized.push(filename);
    }
  }
  return sanitized;
}

export async function assertNoConfiguredSecrets(roots, options = {}) {
  const secrets = normalizedSecrets(options.secrets);
  for (const root of roots) {
    const details = await stat(root).catch(() => null);
    const files = details?.isFile() ? [root] : details?.isDirectory() ? await walk(root) : [];
    for (const filename of files) {
      const bytes = await readFile(filename);
      for (const secret of secrets) {
        if (bytes.includes(Buffer.from(secret))) {
          throw new Error(`Configured secret remains in generated artifact: ${filename}`);
        }
      }
    }
  }
}
