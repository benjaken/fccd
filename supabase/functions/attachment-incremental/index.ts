import { createClient } from "npm:@supabase/supabase-js@2";

const APP_NAME = "fc-order-system";
const APP_VERSION = "live";
const BUCKET = "attachments";
const SOURCE_ROOT = "https://a112cb5fe9cbba3717fadc05fb8851f0.cdn.bubble.io/";
const MAX_ANALYZE_RECORDS = 500;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type UploadedFileRecord = {
  _id: string;
  app_version_text: string;
  appname_text: string;
  content_type_text: string;
  filename_text: string;
  s3_key_text: string;
  size_number: number;
  "Created Date": string;
  "Modified Date": string;
  user_id_text: string;
};

type AttachmentRow = {
  deterministic_key: string;
  source_url_hash: string;
  size_bytes: number | null;
  migration_status: string;
  last_error_code: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function secretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) return legacy;
  const configured = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (configured) {
    const keys = JSON.parse(configured) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  throw new Error("Supabase server secret is not configured.");
}

function createAdminClient() {
  return createClient<any>(
    Deno.env.get("SUPABASE_URL") ?? "",
    secretKey(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

type AdminClient = ReturnType<typeof createAdminClient>;

function validateRecord(value: unknown): UploadedFileRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Attachment record must be an object.");
  }
  const record = value as Record<string, unknown>;
  const textFields = [
    "_id",
    "app_version_text",
    "appname_text",
    "content_type_text",
    "filename_text",
    "s3_key_text",
    "Created Date",
    "Modified Date",
    "user_id_text",
  ] as const;
  for (const field of textFields) {
    if (typeof record[field] !== "string" || !record[field]) {
      throw new Error(`Attachment record is missing ${field}.`);
    }
  }
  if (
    typeof record.size_number !== "number" ||
    !Number.isSafeInteger(record.size_number) ||
    record.size_number < 0 ||
    record.size_number > MAX_FILE_BYTES
  ) {
    throw new Error("Attachment size is invalid or exceeds 50 MB.");
  }
  if (
    record.appname_text !== APP_NAME ||
    record.app_version_text !== APP_VERSION
  ) {
    throw new Error("Only FCCD live attachment records are accepted.");
  }
  if (
    /[\u0000-\u001f\u007f]/.test(record.s3_key_text as string) ||
    (record.s3_key_text as string).startsWith("/") ||
    (record.s3_key_text as string).split("/").includes("..")
  ) {
    throw new Error("Attachment S3 key is invalid.");
  }
  if (
    Number.isNaN(Date.parse(record["Created Date"] as string)) ||
    Number.isNaN(Date.parse(record["Modified Date"] as string))
  ) {
    throw new Error("Attachment timestamps are invalid.");
  }
  return record as unknown as UploadedFileRecord;
}

function sourceUrl(record: UploadedFileRecord) {
  return (
    SOURCE_ROOT +
    record.s3_key_text
      .split("/")
      .map((segment) => {
        try {
          return encodeURIComponent(decodeURIComponent(segment));
        } catch {
          throw new Error("Attachment S3 key contains invalid URL encoding.");
        }
      })
      .join("/")
  );
}

async function sha256(value: string | ArrayBuffer) {
  const input = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function recordIdentity(record: UploadedFileRecord) {
  const canonicalUrl = sourceUrl(record);
  return {
    deterministicKey: await sha256(`bubble_uploaded_file|${record._id}`),
    sourceUrlHash: await sha256(canonicalUrl),
    canonicalUrl,
  };
}

async function requireSuperAdmin(request: Request, admin: AdminClient) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Response("Missing authorization.", { status: 401 });
  }
  const token = authorization.slice("Bearer ".length);
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) {
    throw new Response("Invalid authorization.", { status: 401 });
  }
  if (user.app_metadata?.role !== "Super Admin") {
    throw new Response("Super Admin access is required.", { status: 403 });
  }
}

async function attachmentStatus(admin: AdminClient) {
  const base = () =>
    admin
      .from("attachments")
      .select("id", { count: "exact", head: true })
      .eq("source_type", "bubble_uploaded_file");
  const [totalResult, verifiedResult, failedResult] = await Promise.all([
    base(),
    base().eq("migration_status", "verified"),
    base().eq("migration_status", "failed"),
  ]);
  for (const result of [totalResult, verifiedResult, failedResult]) {
    if (result.error) throw result.error;
  }

  const content = new Map<string, number>();
  let offset = 0;
  while (true) {
    const { data, error } = await admin
      .from("attachments")
      .select("sha256,size_bytes")
      .eq("source_type", "bubble_uploaded_file")
      .eq("migration_status", "verified")
      .not("sha256", "is", null)
      .range(offset, offset + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      if (
        typeof row.sha256 === "string" &&
        typeof row.size_bytes === "number" &&
        !content.has(row.sha256)
      ) {
        content.set(row.sha256, row.size_bytes);
      }
    }
    if (!data || data.length < 1000) break;
    offset += data.length;
  }

  return jsonResponse({
    total: totalResult.count ?? 0,
    verified: verifiedResult.count ?? 0,
    failed: failedResult.count ?? 0,
    uniqueContent: content.size,
    uniqueBytes: [...content.values()].reduce(
      (sum, size) => sum + size,
      0,
    ),
    generatedAt: new Date().toISOString(),
  });
}

async function analyze(
  admin: AdminClient,
  values: unknown,
) {
  if (!Array.isArray(values) || values.length > MAX_ANALYZE_RECORDS) {
    return jsonResponse(
      { error: `Analyze accepts at most ${MAX_ANALYZE_RECORDS} records.` },
      400,
    );
  }
  const records = values.map(validateRecord);
  const unique = new Map<string, UploadedFileRecord>();
  for (const record of records) unique.set(record._id, record);
  const identities = await Promise.all(
    [...unique.values()].map(async (record) => ({
      record,
      ...(await recordIdentity(record)),
    })),
  );
  const keys = identities.map((item) => item.deterministicKey);
  const { data, error } = keys.length
    ? await admin
      .from("attachments")
      .select(
        "deterministic_key,source_url_hash,size_bytes,migration_status,last_error_code",
      )
      .in("deterministic_key", keys)
    : { data: [], error: null };
  if (error) throw error;
  const existing = new Map(
    ((data ?? []) as AttachmentRow[]).map((row) => [
      row.deterministic_key,
      row,
    ]),
  );
  const actionableIds: string[] = [];
  let verified = 0;
  let failed = 0;
  let changed = 0;
  let missing = 0;
  for (const item of identities) {
    const row = existing.get(item.deterministicKey);
    if (!row) {
      missing += 1;
      actionableIds.push(item.record._id);
    } else if (
      row.migration_status === "verified" &&
      row.source_url_hash === item.sourceUrlHash &&
      (
        row.size_bytes === item.record.size_number ||
        row.last_error_code === "source_size_corrected"
      )
    ) {
      verified += 1;
    } else {
      if (row.migration_status === "failed") failed += 1;
      else changed += 1;
      actionableIds.push(item.record._id);
    }
  }
  return jsonResponse({
    records: records.length,
    uniqueIds: unique.size,
    duplicateIds: records.length - unique.size,
    verified,
    failed,
    changed,
    missing,
    actionableIds,
  });
}

async function upsertFailure(
  admin: AdminClient,
  record: UploadedFileRecord,
  deterministicKey: string,
  sourceUrlHash: string,
  code: string,
) {
  const { error } = await admin.from("attachments").upsert(
    {
      deterministic_key: deterministicKey,
      source_type: "bubble_uploaded_file",
      source_legacy_row_id: record._id,
      source_field: "uploaded_files.s3_key_text",
      owner_type: "bubble_user",
      owner_id: null,
      owner_legacy_id: record.user_id_text,
      original_filename: record.filename_text,
      source_url_hash: sourceUrlHash,
      bucket_id: BUCKET,
      object_path: null,
      mime_type: record.content_type_text,
      size_bytes: record.size_number,
      sha256: null,
      source_modified_at: record["Modified Date"],
      migration_mode: "incremental",
      migration_status: "failed",
      last_error_code: code,
      uploaded_at: null,
      verified_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "deterministic_key" },
  );
  if (error) throw error;
}

async function migrate(
  admin: AdminClient,
  value: unknown,
) {
  const record = validateRecord(value);
  const { deterministicKey, sourceUrlHash, canonicalUrl } =
    await recordIdentity(record);
  const { data: current, error: currentError } = await admin
    .from("attachments")
    .select(
      "source_url_hash,size_bytes,migration_status,object_path,last_error_code",
    )
    .eq("deterministic_key", deterministicKey)
    .maybeSingle();
  if (currentError) throw currentError;
  if (
    current?.migration_status === "verified" &&
    current.source_url_hash === sourceUrlHash &&
    (
      current.size_bytes === record.size_number ||
      current.last_error_code === "source_size_corrected"
    )
  ) {
    return jsonResponse({ sourceId: record._id, status: "skipped" });
  }

  const sourceResponse = await fetch(canonicalUrl, {
    headers: { Accept: "*/*", "User-Agent": "FCCD-Attachment-Migrator/2.0" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!sourceResponse.ok) {
    const code = `http_${sourceResponse.status}`;
    await upsertFailure(
      admin,
      record,
      deterministicKey,
      sourceUrlHash,
      code,
    );
    return jsonResponse(
      { sourceId: record._id, status: "failed", error: code },
      422,
    );
  }
  const bytes = await sourceResponse.arrayBuffer();
  const sourceSizeCorrected = bytes.byteLength !== record.size_number;

  const checksum = await sha256(bytes);
  const { data: duplicate, error: duplicateError } = await admin
    .from("attachments")
    .select("object_path")
    .eq("sha256", checksum)
    .eq("migration_status", "verified")
    .not("object_path", "is", null)
    .limit(1)
    .maybeSingle();
  if (duplicateError) throw duplicateError;
  const objectPath = duplicate?.object_path ??
    `sha256/${checksum.slice(0, 2)}/${checksum}`;
  let uploaded = false;
  if (!duplicate?.object_path) {
    const contentType =
      sourceResponse.headers.get("Content-Type")?.split(";")[0] ||
      record.content_type_text;
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(objectPath, bytes, {
        contentType,
        cacheControl: "3600",
        upsert: false,
      });
    if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) {
      throw uploadError;
    }
    uploaded = !uploadError;
  }

  const now = new Date().toISOString();
  const { error: upsertError } = await admin.from("attachments").upsert(
    {
      deterministic_key: deterministicKey,
      source_type: "bubble_uploaded_file",
      source_legacy_row_id: record._id,
      source_field: "uploaded_files.s3_key_text",
      owner_type: "bubble_user",
      owner_id: null,
      owner_legacy_id: record.user_id_text,
      original_filename: record.filename_text,
      source_url_hash: sourceUrlHash,
      bucket_id: BUCKET,
      object_path: objectPath,
      mime_type: record.content_type_text,
      size_bytes: bytes.byteLength,
      sha256: checksum,
      source_modified_at: record["Modified Date"],
      migration_mode: "incremental",
      migration_status: "verified",
      last_error_code: sourceSizeCorrected ? "source_size_corrected" : null,
      uploaded_at: uploaded ? now : null,
      verified_at: now,
      updated_at: now,
    },
    { onConflict: "deterministic_key" },
  );
  if (upsertError) throw upsertError;
  return jsonResponse({
    sourceId: record._id,
    status: uploaded ? "uploaded" : "deduplicated",
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  try {
    const admin = createAdminClient();
    const body = (await request.json()) as {
      action?: unknown;
      records?: unknown;
      record?: unknown;
    };
    if (body.action === "status") return await attachmentStatus(admin);
    await requireSuperAdmin(request, admin);
    if (body.action === "analyze") return await analyze(admin, body.records);
    if (body.action === "migrate") return await migrate(admin, body.record);
    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    if (error instanceof Response) {
      return jsonResponse({ error: await error.text() }, error.status);
    }
    console.error(
      "attachment-incremental failed",
      error instanceof Error ? error.message : "unknown_error",
    );
    return jsonResponse(
      {
        error: error instanceof Error
          ? error.message
          : "Attachment migration failed.",
      },
      500,
    );
  }
});
