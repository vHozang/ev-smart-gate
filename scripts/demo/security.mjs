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
  "card_uid",
  "carduid",
  "cookie",
  "csrf",
  "csrf_token",
  "device_api_key",
  "edge_device_key",
  "embedding_encryption_key",
  "evidence_encryption_key",
  "minio_secret_key",
  "new_card_uid",
  "newcarduid",
  "old_card_uid",
  "oldcarduid",
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
  const name = String(value || "")
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replaceAll("-", "_");
  return (
    sensitiveKeys.has(name) ||
    /(?:^|_)(?:password|passwd|secret|token|cookie|card_?uid)(?:$|_)/.test(name)
  );
}

function isSensitiveValueName(value) {
  const name = String(value || "")
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replaceAll("-", "_");
  return isSensitiveKey(name) || /(?:^|_)(?:auth|csrf|session|card_?uid)(?:$|_)/.test(name);
}

function isEvaluateTraceEntry(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (typeof obj.title === "string" && /evaluate/i.test(obj.title)) return true;
  if (typeof obj.method === "string" && /evaluate/i.test(obj.method)) return true;
  return false;
}

function deepRedactEvaluateArg(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === "string") return redacted;
  if (typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map(deepRedactEvaluateArg);
  const result = {};
  for (const [k, v] of Object.entries(val)) {
    if (k === "value" || k === "s") {
      result[k] = typeof v === "object" && v !== null ? deepRedactEvaluateArg(v) : redacted;
    } else {
      result[k] = deepRedactEvaluateArg(v);
    }
  }
  return result;
}

function sanitizeEvaluateParams(params, secrets) {
  if (!params || typeof params !== "object") return params;
  if (Array.isArray(params)) return params.map((item) => sanitizeEvaluateParams(item, secrets));
  const result = {};
  for (const [key, val] of Object.entries(params)) {
    if (key === "arg" || key === "args") {
      // Deep-redact all values in evaluate arguments
      result[key] = deepRedactEvaluateArg(val);
    } else if (key === "value" || key === "s") {
      result[key] = typeof val === "object" && val !== null ? deepRedactEvaluateArg(val) : redacted;
    } else {
      result[key] = sanitizeValue(val, secrets);
    }
  }
  return result;
}

function redactMultipart(text) {
  return text.replace(
    /(Content-Disposition:\s*form-data;\s*name="([^"]+)"[^\r\n]*(?:\r?\n){2})([^\r\n]+)/gi,
    (match, header, fieldName, fieldValue) => {
      if (isSensitiveValueName(fieldName)) {
        return `${header}${redacted}`;
      }
      return match;
    },
  );
}

function redactUrlEncoded(text) {
  return text.replace(
    /(^|[?&])([^=&]+)=([^&]*)/g,
    (match, prefix, key, value) => {
      try {
        const decodedKey = decodeURIComponent(key);
        if (isSensitiveKey(decodedKey)) {
          return `${prefix}${key}=${redacted}`;
        }
      } catch {
        // Not URL-encoded
      }
      return match;
    },
  );
}

function redactString(value, secrets) {
  let result = value;
  for (const secret of secrets) result = result.replaceAll(secret, redacted);
  result = result.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${redacted}`);
  result = redactMultipart(result);
  if (/[?&]?[^=&]+=/.test(result)) {
    result = redactUrlEncoded(result);
  }
  return result;
}

function sanitizeValue(value, secrets) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.stringify(sanitizeValue(JSON.parse(trimmed), secrets));
      } catch {
        // Non-JSON string
      }
    }
    return redactString(value, secrets);
  }
  if (Array.isArray(value)) return value.map((entry) => sanitizeValue(entry, secrets));
  if (!value || typeof value !== "object") return value;

  const result = {};
  const namedSensitiveValue = isSensitiveValueName(value.name);
  const passwordInput = String(value.type || "").toLowerCase() === "password";
  const evaluateEntry = isEvaluateTraceEntry(value);

  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toLowerCase()
      .replaceAll("-", "_");
    if (key === "params" && evaluateEntry) {
      result[key] = sanitizeEvaluateParams(entry, secrets);
    } else if (
      isSensitiveKey(normalizedKey) ||
      (key === "value" && (namedSensitiveValue || passwordInput)) ||
      (key === "__playwright_value_" && (passwordInput || namedSensitiveValue))
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

function findEvaluateArgSensitive(val, location, findings) {
  if (val === null || val === undefined) return;
  if (typeof val === "string") {
    if (val !== redacted) findings.push(location);
    return;
  }
  if (typeof val !== "object") return;
  if (Array.isArray(val)) {
    val.forEach((item, idx) => findEvaluateArgSensitive(item, `${location}[${idx}]`, findings));
    return;
  }
  for (const [k, v] of Object.entries(val)) {
    findEvaluateArgSensitive(v, `${location}.${k}`, findings);
  }
}

function findEvaluateParamsSensitive(params, location, findings) {
  if (!params || typeof params !== "object") return;
  if (Array.isArray(params)) {
    params.forEach((item, idx) => findEvaluateParamsSensitive(item, `${location}[${idx}]`, findings));
    return;
  }
  for (const [key, val] of Object.entries(params)) {
    if (key === "arg" || key === "args" || key === "value" || key === "s") {
      findEvaluateArgSensitive(val, `${location}.${key}`, findings);
    } else {
      findSensitiveValue(val, `${location}.${key}`, findings);
    }
  }
}

function findUnredactedMultipart(text, location, findings) {
  const matches = text.matchAll(/Content-Disposition:\s*form-data;\s*name="([^"]+)"[^\r\n]*(?:\r?\n){2}([^\r\n]+)/gi);
  for (const match of matches) {
    const fieldName = match[1];
    const fieldValue = match[2];
    if (isSensitiveValueName(fieldName) && fieldValue !== redacted) {
      findings.push(`${location}.${fieldName}`);
    }
  }
}

function findUnredactedUrlEncoded(text, location, findings) {
  const matches = text.matchAll(/(?:^|[?&])([^=&]+)=([^&]*)/g);
  for (const match of matches) {
    const key = match[1];
    const val = match[2];
    try {
      const decodedKey = decodeURIComponent(key);
      if (isSensitiveKey(decodedKey) && val !== redacted) {
        findings.push(`${location}.${key}`);
      }
    } catch {}
  }
}

function findSensitiveValue(value, location = "$", findings = []) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        findSensitiveValue(JSON.parse(trimmed), location, findings);
        return findings;
      } catch {
        // Non-JSON string
      }
    }
    findUnredactedMultipart(value, location, findings);
    if (/[?&]?[^=&]+=/.test(value)) {
      findUnredactedUrlEncoded(value, location, findings);
    }
    return findings;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findSensitiveValue(entry, `${location}[${index}]`, findings));
    return findings;
  }
  if (!value || typeof value !== "object") return findings;

  const namedSensitiveValue = isSensitiveValueName(value.name);
  const passwordInput = String(value.type || "").toLowerCase() === "password";
  const evaluateEntry = isEvaluateTraceEntry(value);

  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toLowerCase()
      .replaceAll("-", "_");
    if (key === "params" && evaluateEntry) {
      findEvaluateParamsSensitive(entry, `${location}.${key}`, findings);
    } else {
      const shouldBeRedacted =
        isSensitiveKey(normalizedKey) ||
        (key === "value" && (namedSensitiveValue || passwordInput)) ||
        (key === "__playwright_value_" && (passwordInput || namedSensitiveValue)) ||
        (key === "value" && sensitiveHeaderNames.has(String(value.name || "").toLowerCase()));
      if (shouldBeRedacted && entry !== redacted) findings.push(`${location}.${key}`);
      else findSensitiveValue(entry, `${location}.${key}`, findings);
    }
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
      // Non-JSON
    }
  }

  // Also check all UTF-8 text entries for multipart and URL-encoded sensitive values
  if (text) {
    findUnredactedMultipart(text, name, findings);
    if (/[?&]?[^=&]+=/.test(text)) {
      findUnredactedUrlEncoded(text, name, findings);
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
