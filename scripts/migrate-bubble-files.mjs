#!/usr/bin/env node

/**
 * Server-only Bubble file migration runner.
 *
 * Raw source URLs and potentially sensitive metadata are written only beneath
 * .migration-data/, which is git-ignored. Console output uses aggregate counts.
 */
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { createClient } from "@supabase/supabase-js";
import * as tus from "tus-js-client";

const EXPECTED_TOTAL = 4_198;
const SNAPSHOT_DIR = ".migration-data/full-snapshot";
const WORK_DIR =
  process.env.BUBBLE_FILE_MIGRATION_WORK_DIR ??
  ".migration-data/file-migration";
const MANIFEST_PATH = join(WORK_DIR, "manifest.json");
const CHECKPOINT_PATH = join(WORK_DIR, "checkpoint.json");
const LOCK_PATH = join(WORK_DIR, "incremental.lock");
const CACHE_DIR = join(WORK_DIR, "cache");
const BUCKET = process.env.ATTACHMENTS_BUCKET ?? "bubble-attachments-private";
const LARGE_FILE_THRESHOLD = 6 * 1024 * 1024;
const DEFAULT_CONCURRENCY = 6;
const FILE_FIELD_PATTERN =
  /(file|image|photo|logo|sheet|attachment|font|bold|regular)/i;

const flags = parseArgs(process.argv.slice(2));
const command = flags._[0];
const commands = {
  discover,
  enrich,
  upload,
  verify,
};

if (!["discover", "enrich", "upload", "verify", "incremental"].includes(command)) {
  usage();
  process.exitCode = 1;
} else {
  await mkdir(WORK_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
  if (command === "incremental") {
    await withIncrementalLock(() => runIncremental(flags));
  } else {
    await commands[command](flags);
  }
}

function usage() {
  console.error(`Usage:
  node scripts/migrate-bubble-files.mjs discover [--snapshot-dir PATH] [--inventory PATH] [--mode baseline|incremental] [--modified-after ISO]
  node scripts/migrate-bubble-files.mjs enrich [--concurrency 4..8]
  node scripts/migrate-bubble-files.mjs upload [--concurrency 4..8] [--allow-partial]
  node scripts/migrate-bubble-files.mjs verify [--concurrency 4..8]
  node scripts/migrate-bubble-files.mjs incremental --inventory PATH [--concurrency 4..8]

upload, verify, and incremental require SUPABASE_URL plus
SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY in the server environment.`);
}

function parseArgs(args) {
  const parsed = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) {
      parsed._.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSourceUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  throw new Error("Only HTTPS or protocol-relative source file URLs are accepted");
}

function safeSegment(value) {
  return String(value ?? "unknown")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48) || "unknown";
}

function extensionFor(url, mimeType) {
  const extension = extname(new URL(url).pathname).toLowerCase();
  if (/^\.[a-z0-9]{1,10}$/.test(extension)) return extension;
  const known = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/svg+xml": ".svg",
    "text/csv": ".csv",
  };
  return known[mimeType] ?? "";
}

function makeEntry({
  url,
  sourceType,
  sourceLegacyRowId,
  sourceField,
  ownerType,
  ownerId,
  ownerLegacyId,
  originalFilename,
  sourceModifiedAt,
  mode,
}) {
  const canonicalUrl = canonicalSourceUrl(url);
  const sourceUrlHash = sha256(canonicalUrl);
  const deterministicKey = sha256(
    [
      sourceType,
      sourceLegacyRowId ?? "",
      sourceField,
      sourceUrlHash,
    ].join("\u001f"),
  );
  return {
    deterministicKey,
    sourceUrlHash,
    sourceUrl: canonicalUrl,
    sourceType,
    sourceLegacyRowId: sourceLegacyRowId || null,
    sourceField,
    ownerType: ownerType || null,
    ownerId: validUuid(ownerId) ? ownerId : null,
    ownerLegacyId: ownerLegacyId || null,
    originalFilename: originalFilename || filenameFromUrl(canonicalUrl),
    sourceModifiedAt: validDate(sourceModifiedAt),
    migrationMode: mode,
    migrationStatus: "discovered",
    mimeType: null,
    sizeBytes: null,
    sha256: null,
    objectPath: null,
    uploadedAt: null,
    verifiedAt: null,
    lastErrorCode: null,
  };
}

function filenameFromUrl(url) {
  try {
    return decodeURIComponent(basename(new URL(url).pathname)) || null;
  } catch {
    return null;
  }
}

function validDate(value) {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? ""),
  );
}

async function discover(options) {
  const mode = options.mode === "incremental" ? "incremental" : "baseline";
  const modifiedAfter = options["modified-after"]
    ? Date.parse(options["modified-after"])
    : null;
  if (options["modified-after"] && Number.isNaN(modifiedAfter)) {
    throw new Error("--modified-after must be an ISO date");
  }

  const snapshotDir = options["snapshot-dir"] ?? SNAPSHOT_DIR;
  const exportManifest = JSON.parse(
    await readFile(join(snapshotDir, "export-manifest.json"), "utf8"),
  );
  const entries = [];

  for (const item of exportManifest.exports) {
    const body = await readFile(join(snapshotDir, "objects", item.file), "utf8");
    for (const line of body.split(/\r?\n/)) {
      if (!line) continue;
      const row = JSON.parse(line);
      const sourceModifiedAt =
        row["Modified Date"] ?? row.modified_date ?? row.modifiedAt;
      if (
        modifiedAfter !== null &&
        (!sourceModifiedAt || Date.parse(sourceModifiedAt) <= modifiedAfter)
      ) {
        continue;
      }
      for (const [field, value] of Object.entries(row)) {
        if (!FILE_FIELD_PATTERN.test(field)) continue;
        for (const url of fileValues(value)) {
          if (!String(url).trim().startsWith("//")) continue;
          entries.push(
            makeEntry({
              url,
              sourceType: item.type,
              sourceLegacyRowId: row._id ?? row.id,
              sourceField: field,
              ownerType: inferOwnerType(item.type),
              ownerLegacyId: inferOwnerLegacyId(item.type, row),
              originalFilename: null,
              sourceModifiedAt,
              mode,
            }),
          );
        }
      }
    }
  }

  if (options.inventory) {
    entries.push(...(await importInventory(options.inventory, mode, modifiedAfter)));
  }

  const previous = await loadManifest().catch(() => ({ entries: [] }));
  const merged = new Map(
    previous.entries.map((entry) => [entry.deterministicKey, entry]),
  );
  for (const entry of entries) {
    const existing = merged.get(entry.deterministicKey);
    const changedIncremental =
      mode === "incremental" &&
      entry.sourceModifiedAt &&
      (!existing?.sourceModifiedAt ||
        entry.sourceModifiedAt > existing.sourceModifiedAt);
    if (changedIncremental) {
      merged.set(entry.deterministicKey, { ...existing, ...entry });
    } else {
      merged.set(
        entry.deterministicKey,
        existing ? { ...entry, ...existing } : entry,
      );
    }
  }

  await saveManifest({
    schemaVersion: 1,
    expectedTotal: EXPECTED_TOTAL,
    snapshotAt: exportManifest.snapshotAt,
    inventoryImported: Boolean(options.inventory),
    entries: [...merged.values()].sort((left, right) =>
      left.deterministicKey.localeCompare(right.deterministicKey),
    ),
  });
  console.log(
    `Discovery checkpoint saved: ${merged.size.toLocaleString()} unique references; ` +
      `${Math.max(0, EXPECTED_TOTAL - merged.size).toLocaleString()} inventory items remain gated.`,
  );
}

function fileValues(value) {
  if (Array.isArray(value)) return value.flatMap(fileValues);
  return typeof value === "string" ? [value] : [];
}

function inferOwnerType(sourceType) {
  return {
    quote_file: "order",
    b_deliveryschedule: "delivery",
    shop_dailysales: "restaurant_daily_sale",
    ds_channel: "channel",
  }[sourceType] ?? sourceType;
}

function inferOwnerLegacyId(sourceType, row) {
  const aliases = {
    quote_file: ["A_order", "order", "order_id"],
    b_deliveryschedule: ["A_order", "order", "delivery"],
    shop_dailysales: ["restro", "shopdsrestro"],
    ds_channel: ["_id"],
  }[sourceType] ?? [];
  return aliases.map((key) => row[key]).find(Boolean) ?? null;
}

async function importInventory(path, mode, modifiedAfter) {
  const text = await readFile(path, "utf8");
  const rows = path.toLowerCase().endsWith(".json")
    ? normalizeJsonInventory(JSON.parse(text))
    : parseCsv(text);
  const entries = [];
  for (const row of rows) {
    const url = pick(row, ["url", "URL", "file url", "File URL", "source_url"]);
    if (!url) continue;
    const modified = pick(row, [
      "Modified Date",
      "modified_date",
      "modifiedAt",
      "upload date",
      "Upload date",
    ]);
    if (
      modifiedAfter !== null &&
      (!modified || Date.parse(modified) <= modifiedAfter)
    ) {
      continue;
    }
    entries.push(
      makeEntry({
        url,
        sourceType: pick(row, ["source type", "source_type", "type"]) ?? "file_manager",
        sourceLegacyRowId: pick(row, [
          "source row id",
          "source_legacy_row_id",
          "attached id",
        ]),
        sourceField: pick(row, ["source field", "source_field", "field"]) ?? "file",
        ownerType: pick(row, ["owner type", "owner_type", "attached to type"]),
        ownerId: pick(row, ["owner uuid", "owner_id"]),
        ownerLegacyId: pick(row, [
          "owner legacy id",
          "owner_legacy_id",
          "attached to",
        ]),
        originalFilename: pick(row, ["file name", "File name", "filename", "name"]),
        sourceModifiedAt: modified,
        mode,
      }),
    );
  }
  return entries;
}

function normalizeJsonInventory(value) {
  if (Array.isArray(value)) return value;
  for (const key of ["files", "items", "results", "data"]) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  throw new Error("Inventory JSON must be an array or contain files/items/results/data");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  row.push(value);
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map((header) => header.trim()) ?? [];
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );
}

function pick(row, aliases) {
  return aliases.map((alias) => row?.[alias]).find((value) => value !== undefined && value !== "");
}

async function enrich(options) {
  const manifest = await loadManifest();
  const pending = manifest.entries.filter(
    (entry) => entry.migrationStatus === "discovered" || entry.migrationStatus === "failed",
  );
  await mapConcurrent(pending, concurrency(options), async (entry, index) => {
    try {
      const response = await fetchWithRetry(entry.sourceUrl, { method: "HEAD" });
      entry.sizeBytes = numericHeader(response.headers.get("content-length"));
      entry.mimeType = response.headers.get("content-type")?.split(";")[0] ?? null;
      entry.objectPath = null;
      entry.migrationStatus = "enriched";
      entry.lastErrorCode = null;
    } catch (error) {
      entry.migrationStatus = "failed";
      entry.lastErrorCode = safeErrorCode(error);
    }
    if ((index + 1) % 25 === 0) await saveManifest(manifest);
  });
  await saveManifest(manifest);
  printStatus("Enrichment", manifest);
}

function objectPath(entry) {
  const extension = extensionFor(entry.sourceUrl, entry.mimeType);
  if (!entry.sha256) throw new Error("CHECKSUM_REQUIRED_FOR_OBJECT_PATH");
  return `${safeSegment(entry.sourceType)}/${entry.sourceUrlHash.slice(0, 2)}/${entry.sourceUrlHash}/${entry.sha256}${extension}`;
}

function numericHeader(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

async function upload(options) {
  const manifest = await loadManifest();
  if (
    !options["allow-partial"] &&
    (!manifest.inventoryImported || manifest.entries.length < EXPECTED_TOTAL)
  ) {
    throw new Error(
      `Baseline upload blocked: provide a complete File Manager export (${EXPECTED_TOTAL} expected) or explicitly use --allow-partial.`,
    );
  }
  const { client, secret, url } = serverSupabase();
  const pending = manifest.entries.filter(
    (entry) =>
      ["enriched", "failed"].includes(entry.migrationStatus) &&
      (!options["_only-mode"] || entry.migrationMode === options["_only-mode"]),
  );
  await mapConcurrent(pending, concurrency(options), async (entry, index) => {
    let cachePath;
    try {
      cachePath = await downloadToCache(entry);
      const info = await stat(cachePath);
      entry.sizeBytes = info.size;
      entry.sha256 = await hashFile(cachePath);
      entry.objectPath = objectPath(entry);

      const duplicate = manifest.entries.find(
        (candidate) =>
          candidate !== entry &&
          candidate.sourceUrlHash === entry.sourceUrlHash &&
          candidate.objectPath === entry.objectPath &&
          candidate.sha256 === entry.sha256 &&
          ["uploaded", "verified"].includes(candidate.migrationStatus),
      );
      if (!duplicate) {
        if (info.size > LARGE_FILE_THRESHOLD) {
          await tusUpload({ cachePath, entry, secret, supabaseUrl: url });
        } else {
          const bytes = await readFile(cachePath);
          const result = await client.storage
            .from(BUCKET)
            .upload(entry.objectPath, bytes, {
              contentType: entry.mimeType ?? "application/octet-stream",
              upsert: false,
            });
          if (result.error && !/already exists|duplicate/i.test(result.error.message)) {
            throw result.error;
          }
        }
      }
      entry.migrationStatus = "uploaded";
      entry.uploadedAt = new Date().toISOString();
      entry.lastErrorCode = null;
      await upsertAttachment(client, entry);
    } catch (error) {
      entry.migrationStatus = "failed";
      entry.lastErrorCode = safeErrorCode(error);
    } finally {
      if (cachePath) await rm(cachePath, { force: true });
    }
    if ((index + 1) % 10 === 0) await saveManifest(manifest);
  });
  await saveManifest(manifest);
  printStatus("Upload", manifest);
}

async function downloadToCache(entry) {
  const destination = join(CACHE_DIR, `${entry.deterministicKey}.${randomUUID()}`);
  const response = await fetchWithRetry(entry.sourceUrl);
  if (!response.body) throw new Error("SOURCE_EMPTY_BODY");
  await pipeline(Readable.fromWeb(response.body), createWriteStreamAtomic(destination));
  return destination;
}

function createWriteStreamAtomic(destination) {
  return createWriteStream(destination, { flags: "wx", mode: 0o600 });
}

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function tusUpload({ cachePath, entry, secret, supabaseUrl }) {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(createReadStream(cachePath), {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      uploadSize: entry.sizeBytes,
      retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
      headers: {
        authorization: `Bearer ${secret}`,
        apikey: secret,
        "x-upsert": "false",
      },
      metadata: {
        bucketName: BUCKET,
        objectName: entry.objectPath,
        contentType: entry.mimeType ?? "application/octet-stream",
      },
      removeFingerprintOnSuccess: true,
      onError: reject,
      onSuccess: resolve,
    });
    upload.findPreviousUploads().then((previous) => {
      if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }, reject);
  });
}

async function verify(options) {
  const manifest = await loadManifest();
  const { client, secret, url } = serverSupabase();
  const pending = manifest.entries.filter(
    (entry) =>
      entry.migrationStatus === "uploaded" &&
      (!options["_only-mode"] || entry.migrationMode === options["_only-mode"]),
  );
  await mapConcurrent(pending, concurrency(options), async (entry, index) => {
    try {
      const encodedPath = entry.objectPath
        .split("/")
        .map(encodeURIComponent)
        .join("/");
      const response = await fetchWithRetry(
        `${url}/storage/v1/object/authenticated/${encodeURIComponent(BUCKET)}/${encodedPath}`,
        { headers: { authorization: `Bearer ${secret}`, apikey: secret } },
      );
      if (!response.body) throw new Error("VERIFY_EMPTY_BODY");
      const hash = createHash("sha256");
      let bytes = 0;
      for await (const chunk of Readable.fromWeb(response.body)) {
        hash.update(chunk);
        bytes += chunk.length;
      }
      if (bytes !== entry.sizeBytes || hash.digest("hex") !== entry.sha256) {
        throw new Error("VERIFY_CHECKSUM_OR_SIZE_MISMATCH");
      }
      entry.migrationStatus = "verified";
      entry.verifiedAt = new Date().toISOString();
      entry.lastErrorCode = null;
      await upsertAttachment(client, entry);
    } catch (error) {
      entry.migrationStatus = "failed";
      entry.lastErrorCode = safeErrorCode(error);
    }
    if ((index + 1) % 10 === 0) await saveManifest(manifest);
  });
  await saveManifest(manifest);
  const baseline = manifest.entries.filter(
    (entry) => entry.migrationMode === "baseline",
  );
  if (
    manifest.inventoryImported &&
    baseline.length >= EXPECTED_TOTAL &&
    baseline.every((entry) => entry.migrationStatus === "verified")
  ) {
    const latest = baseline
      .map((entry) => entry.sourceModifiedAt)
      .filter(Boolean)
      .sort()
      .at(-1);
    if (latest) {
      await saveCheckpoint({
        lastSuccessfulModifiedDate: latest,
        verifiedAt: new Date().toISOString(),
      });
    }
  }
  printStatus("Verification", manifest);
}

async function runIncremental(options) {
  if (!options.inventory) {
    throw new Error("incremental requires a current --inventory CSV or JSON export");
  }
  const checkpoint = await loadCheckpoint();
  if (!checkpoint.lastSuccessfulModifiedDate) {
    throw new Error("No successful baseline checkpoint exists");
  }
  await discover({
    ...options,
    mode: "incremental",
    "modified-after": checkpoint.lastSuccessfulModifiedDate,
  });
  await enrich(options);
  await upload({ ...options, "_only-mode": "incremental" });
  await verify({ ...options, "_only-mode": "incremental" });
  const manifest = await loadManifest();
  const incremental = manifest.entries.filter(
    (entry) => entry.migrationMode === "incremental",
  );
  if (incremental.some((entry) => entry.migrationStatus !== "verified")) {
    throw new Error("Incremental checkpoint not advanced: one or more files failed");
  }
  const latest = incremental
    .map((entry) => entry.sourceModifiedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  if (latest) {
    await saveCheckpoint({
      lastSuccessfulModifiedDate: latest,
      verifiedAt: new Date().toISOString(),
    });
  }
}

async function upsertAttachment(client, entry) {
  const row = {
    deterministic_key: entry.deterministicKey,
    source_type: entry.sourceType,
    source_legacy_row_id: entry.sourceLegacyRowId,
    source_field: entry.sourceField,
    owner_type: entry.ownerType,
    owner_id: entry.ownerId,
    owner_legacy_id: entry.ownerLegacyId,
    original_filename: entry.originalFilename,
    source_url_hash: entry.sourceUrlHash,
    bucket_id: BUCKET,
    object_path: entry.objectPath,
    mime_type: entry.mimeType,
    size_bytes: entry.sizeBytes,
    sha256: entry.sha256,
    source_modified_at: entry.sourceModifiedAt,
    migration_mode: entry.migrationMode,
    migration_status: entry.migrationStatus,
    last_error_code: entry.lastErrorCode,
    uploaded_at: entry.uploadedAt,
    verified_at: entry.verifiedAt,
    updated_at: new Date().toISOString(),
  };
  const { error } = await client
    .from("attachments")
    .upsert(row, { onConflict: "deterministic_key" });
  if (error) throw error;
}

function serverSupabase() {
  const url = process.env.SUPABASE_URL;
  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY are required",
    );
  }
  if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Refusing browser-prefixed server secret variables");
  }
  return {
    url: url.replace(/\/+$/, ""),
    secret,
    client: createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

async function fetchWithRetry(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        redirect: "follow",
        signal: AbortSignal.timeout(120_000),
      });
      if (response.ok) return response;
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`HTTP_${response.status}`);
      }
      lastError = new Error(`HTTP_${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(16_000, 1_000 * 2 ** attempt)),
    );
  }
  throw lastError;
}

function concurrency(options) {
  const value = Number(options.concurrency ?? DEFAULT_CONCURRENCY);
  if (!Number.isInteger(value) || value < 4 || value > 8) {
    throw new Error("--concurrency must be an integer from 4 through 8");
  }
  return value;
}

async function mapConcurrent(items, limit, worker) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        await worker(items[index], index);
      }
    }),
  );
}

async function loadManifest() {
  return JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
}

async function saveManifest(manifest) {
  const temporary = `${MANIFEST_PATH}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, MANIFEST_PATH);
}

async function loadCheckpoint() {
  return JSON.parse(await readFile(CHECKPOINT_PATH, "utf8"));
}

async function saveCheckpoint(checkpoint) {
  const temporary = `${CHECKPOINT_PATH}.tmp`;
  await writeFile(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, CHECKPOINT_PATH);
}

async function withIncrementalLock(worker) {
  let handle;
  try {
    handle = await open(LOCK_PATH, "wx", 0o600);
    await handle.writeFile(
      `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`,
    );
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new Error("Incremental migration is locked by another run");
    }
    throw error;
  }
  try {
    return await worker();
  } finally {
    await handle.close();
    await rm(LOCK_PATH, { force: true });
  }
}

function safeErrorCode(error) {
  const value = String(error?.message ?? error ?? "UNKNOWN");
  if (/^HTTP_\d{3}$/.test(value)) return value;
  if (/^[A-Z0-9_]{3,80}$/.test(value)) return value;
  return `ERROR_${sha256(value).slice(0, 12).toUpperCase()}`;
}

function printStatus(label, manifest) {
  const counts = Object.groupBy(
    manifest.entries,
    (entry) => entry.migrationStatus,
  );
  console.log(
    `${label} checkpoint saved: ${manifest.entries.length.toLocaleString()} total; ` +
      `${Object.entries(counts)
        .map(([status, entries]) => `${status}=${entries.length}`)
        .join(", ")}.`,
  );
}
