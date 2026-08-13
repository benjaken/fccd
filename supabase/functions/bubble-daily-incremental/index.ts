import { createClient } from "npm:@supabase/supabase-js@2";
import {
  type BubbleRecord,
  canAdvanceCheckpoint,
  hashBubblePayload,
  partitionConflicts,
  requireLegacyId,
  sha256Hex,
} from "./helpers.ts";
import {
  coreMappings,
  type Phase,
  type Relation,
  type SourceMapping,
  unsupportedMappings,
} from "./mappings.ts";
import { remainingMappings } from "./remaining-mappings.ts";

const BUBBLE_BASE_URL = "https://cs.foodchannels-catering.com/api/1.1/obj";
const INITIAL_CHECKPOINT = "2026-08-12T02:39:34.000Z";
const PHASE_ORDER: Phase[] = ["a", "b", "c", "d1", "d2", "e", "remaining"];
const FETCH_LIMIT = 100;
const MAX_PAGES_PER_TYPE = 100;
const INSERT_CHUNK = 250;
const QUERY_CHUNK = 100;
const SOFT_RUNTIME_MS = 60_000;

type AdminClient = ReturnType<typeof createClient<any>>;
type Checkpoint = {
  source_type: string;
  checkpoint_at: string;
  records_inserted: number;
  conflicts_logged: number;
};
type TypeResult = {
  sourceType: string;
  table: string;
  checkpoint: string;
  watermark: string;
  fetched: number;
  inserted: number;
  conflicts: number;
  junctionsInserted: number;
  pages: number;
  status: "completed" | "failed" | "resumable";
  error?: string;
  errorDetail?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) return legacy;
  const configured = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (configured) {
    try {
      const fallback = (JSON.parse(configured) as Record<string, unknown>)
        .default;
      if (typeof fallback === "string" && fallback.trim()) {
        return fallback.trim();
      }
    } catch {
      throw new Error("SUPABASE_SECRET_KEYS is not valid JSON.");
    }
  }
  throw new Error("Supabase server secret is not configured.");
}

async function constantTimeEqual(
  supplied: string | null,
  expected: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied ?? "")),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  let difference = (supplied ?? "").length ^ expected.length;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

async function authenticateCron(
  request: Request,
  client: AdminClient,
): Promise<boolean> {
  const supplied = request.headers.get("x-cron-secret");
  if (!supplied) return false;
  const { data, error } = await client
    .from("bubble_incremental_cron_auth")
    .select("secret_sha256")
    .eq("singleton", true)
    .single();
  if (error || !data?.secret_sha256) {
    console.error("bubble-daily-incremental cron auth is not configured");
    return false;
  }
  return constantTimeEqual(
    await sha256Hex(supplied),
    String(data.secret_sha256),
  );
}

function safeError(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" &&
        "message" in error && typeof error.message === "string"
    ? error.message
    : "Unknown error";
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9._-]+/g, "[redacted]")
    .slice(0, 500);
}

function errorCode(error: unknown): string {
  const message = safeError(error);
  if (message.includes("required") && message.includes("unresolved")) {
    return "unresolved_required_foreign_key";
  }
  if (message.startsWith("Bubble ")) return "bubble_fetch_failed";
  if (
    message.includes("missing _id") || message.includes("duplicate _id") ||
    message.includes("out-of-window")
  ) {
    return "invalid_bubble_record";
  }
  if (message.includes("Checkpoint changed concurrently")) {
    return "checkpoint_concurrency_conflict";
  }
  return "source_type_failed";
}

function selectedPhases(value: unknown): Phase[] {
  if (value == null || value === "" || value === "all") return PHASE_ORDER;
  if (typeof value !== "string" || !PHASE_ORDER.includes(value as Phase)) {
    throw new Error(
      "phase must be one of a, b, c, d1, d2, e, remaining, or all.",
    );
  }
  return [value as Phase];
}

async function fetchBubbleType(
  sourceType: string,
  checkpoint: string,
  watermark: string,
  bubbleToken: string,
  deadline: number,
): Promise<{
  records: BubbleRecord[];
  pages: number;
  resumable: boolean;
}> {
  const records: BubbleRecord[] = [];
  let cursor = 0;
  let pages = 0;
  let remaining = 0;

  while (pages < MAX_PAGES_PER_TYPE) {
    if (Date.now() >= deadline) {
      return { records: [], pages, resumable: true };
    }
    const query = new URLSearchParams({
      limit: String(FETCH_LIMIT),
      cursor: String(cursor),
      sort_field: "Modified Date",
      descending: "false",
      constraints: JSON.stringify([
        {
          key: "Modified Date",
          constraint_type: "greater than",
          value: checkpoint,
        },
        {
          key: "Modified Date",
          constraint_type: "less than",
          value: watermark,
        },
      ]),
    });
    const response = await fetch(
      `${BUBBLE_BASE_URL}/${encodeURIComponent(sourceType)}?${query}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${bubbleToken}`,
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    const payload = await response.json().catch(() => null);
    const pageRows = payload?.response?.results;
    if (!response.ok || !Array.isArray(pageRows)) {
      throw new Error(
        `Bubble fetch for ${sourceType} failed with HTTP ${response.status}.`,
      );
    }
    records.push(...(pageRows as BubbleRecord[]));
    pages += 1;
    remaining = Number(payload.response.remaining ?? 0);
    if (!Number.isFinite(remaining) || remaining < 0) {
      throw new Error(`Bubble returned invalid pagination for ${sourceType}.`);
    }
    if (remaining === 0) break;
    if (pageRows.length === 0) {
      throw new Error(
        `Bubble pagination stalled for ${sourceType} at cursor ${cursor}.`,
      );
    }
    cursor += pageRows.length;
  }

  if (remaining > 0) return { records: [], pages, resumable: true };
  const seen = new Set<string>();
  for (const record of records) {
    const legacyId = requireLegacyId(record);
    if (seen.has(legacyId)) {
      throw new Error(`Bubble returned a duplicate _id for ${sourceType}.`);
    }
    seen.add(legacyId);
    const modified = record["Modified Date"];
    const modifiedAt = typeof modified === "string"
      ? Date.parse(modified)
      : Number.NaN;
    if (
      Number.isNaN(modifiedAt) ||
      modifiedAt <= Date.parse(checkpoint) ||
      modifiedAt >= Date.parse(watermark)
    ) {
      throw new Error(
        `Bubble returned an out-of-window record for ${sourceType}.`,
      );
    }
  }
  return { records, pages, resumable: false };
}

async function getCheckpoint(
  client: AdminClient,
  sourceType: string,
): Promise<Checkpoint> {
  const { error: initializeError } = await client
    .from("bubble_incremental_checkpoints")
    .upsert(
      { source_type: sourceType, checkpoint_at: INITIAL_CHECKPOINT },
      { onConflict: "source_type", ignoreDuplicates: true },
    );
  if (initializeError) throw initializeError;
  const { data, error } = await client
    .from("bubble_incremental_checkpoints")
    .select(
      "source_type,checkpoint_at,records_inserted,conflicts_logged",
    )
    .eq("source_type", sourceType)
    .single();
  if (error) throw error;
  return data as Checkpoint;
}

async function legacyIdRows(
  client: AdminClient,
  table: string,
  legacyIds: string[],
): Promise<Array<{ id: string; legacy_id: string }>> {
  const rows: Array<{ id: string; legacy_id: string }> = [];
  const unique = [...new Set(legacyIds)];
  for (let index = 0; index < unique.length; index += QUERY_CHUNK) {
    const { data, error } = await client
      .from(table)
      .select("id,legacy_id")
      .in("legacy_id", unique.slice(index, index + QUERY_CHUNK));
    if (error) throw error;
    rows.push(...((data ?? []) as Array<{ id: string; legacy_id: string }>));
  }
  return rows;
}

async function resolveRelations(
  client: AdminClient,
  rows: Array<Record<string, unknown>>,
  relations: Relation[] = [],
): Promise<void> {
  for (const spec of relations) {
    const legacyIds = rows.flatMap((row) =>
      typeof row[spec.legacyField] === "string" && row[spec.legacyField]
        ? [row[spec.legacyField] as string]
        : []
    );
    if (!legacyIds.length) continue;
    const resolved = new Map(
      (await legacyIdRows(client, spec.table, legacyIds)).map((row) => [
        row.legacy_id,
        row.id,
      ]),
    );
    let unresolved = 0;
    for (const row of rows) {
      const legacyId = row[spec.legacyField];
      if (typeof legacyId !== "string" || !legacyId) continue;
      row[spec.idField] = resolved.get(legacyId) ?? null;
      if (spec.required !== false && !row[spec.idField]) unresolved += 1;
    }
    if (unresolved) {
      throw new Error(
        `${unresolved} required ${spec.table} references are unresolved.`,
      );
    }
  }
}

async function insertOnlyParents(
  client: AdminClient,
  table: string,
  rows: Array<Record<string, unknown>>,
): Promise<Array<{ id: string; legacy_id: string }>> {
  const inserted: Array<{ id: string; legacy_id: string }> = [];
  for (let index = 0; index < rows.length; index += INSERT_CHUNK) {
    const { data, error } = await client
      .from(table)
      .upsert(rows.slice(index, index + INSERT_CHUNK), {
        onConflict: "legacy_id",
        ignoreDuplicates: true,
      })
      .select("id,legacy_id");
    if (error) throw error;
    inserted.push(
      ...((data ?? []) as Array<{ id: string; legacy_id: string }>),
    );
  }
  return inserted;
}

async function insertOnlyJunctions(
  client: AdminClient,
  table: string,
  onConflict: string,
  rows: Array<Record<string, unknown>>,
): Promise<number> {
  let inserted = 0;
  for (let index = 0; index < rows.length; index += INSERT_CHUNK) {
    const { data, error } = await client
      .from(table)
      .upsert(rows.slice(index, index + INSERT_CHUNK), {
        onConflict,
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) throw error;
    inserted += data?.length ?? 0;
  }
  return inserted;
}

async function logConflicts(
  client: AdminClient,
  runId: string,
  sourceType: string,
  records: BubbleRecord[],
): Promise<number> {
  let logged = 0;
  for (let index = 0; index < records.length; index += INSERT_CHUNK) {
    const values = await Promise.all(
      records.slice(index, index + INSERT_CHUNK).map(async (record) => ({
        run_id: runId,
        source_type: sourceType,
        source_legacy_id: requireLegacyId(record),
        bubble_modified_at: record["Modified Date"],
        reason: "existing_legacy_id_preserved",
        payload_sha256: await hashBubblePayload(record),
      })),
    );
    const { data, error } = await client
      .from("bubble_incremental_conflicts")
      .upsert(values, {
        onConflict: "run_id,source_type,source_legacy_id",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) throw error;
    logged += data?.length ?? 0;
  }
  return logged;
}

async function advanceCheckpoint(
  client: AdminClient,
  checkpoint: Checkpoint,
  watermark: string,
  runId: string,
  inserted: number,
  conflicts: number,
): Promise<void> {
  const { data, error } = await client
    .from("bubble_incremental_checkpoints")
    .update({
      checkpoint_at: watermark,
      last_successful_run_id: runId,
      records_inserted: Number(checkpoint.records_inserted) + inserted,
      conflicts_logged: Number(checkpoint.conflicts_logged) + conflicts,
      updated_at: new Date().toISOString(),
    })
    .eq("source_type", checkpoint.source_type)
    .eq("checkpoint_at", checkpoint.checkpoint_at)
    .select("source_type")
    .maybeSingle();
  if (error) throw error;
  if (data) return;

  const { data: current, error: currentError } = await client
    .from("bubble_incremental_checkpoints")
    .select("checkpoint_at")
    .eq("source_type", checkpoint.source_type)
    .single();
  if (currentError) throw currentError;
  if (Date.parse(current.checkpoint_at) < Date.parse(watermark)) {
    throw new Error(
      `Checkpoint changed concurrently for ${checkpoint.source_type}.`,
    );
  }
}

async function processType(
  client: AdminClient,
  mapping: SourceMapping,
  runId: string,
  watermark: string,
  bubbleToken: string,
  deadline: number,
): Promise<TypeResult> {
  const checkpoint = await getCheckpoint(client, mapping.sourceType);
  const result: TypeResult = {
    sourceType: mapping.sourceType,
    table: mapping.table,
    checkpoint: checkpoint.checkpoint_at,
    watermark,
    fetched: 0,
    inserted: 0,
    conflicts: 0,
    junctionsInserted: 0,
    pages: 0,
    status: "failed",
  };

  try {
    const fetched = await fetchBubbleType(
      mapping.sourceType,
      checkpoint.checkpoint_at,
      watermark,
      bubbleToken,
      deadline,
    );
    result.pages = fetched.pages;
    if (fetched.resumable) {
      result.status = "resumable";
      return result;
    }
    if (Date.now() >= deadline) {
      result.status = "resumable";
      return result;
    }
    result.fetched = fetched.records.length;
    const ids = fetched.records.map(requireLegacyId);
    const existingRows = await legacyIdRows(client, mapping.table, ids);
    const existingIds = new Set(existingRows.map((row) => row.legacy_id));
    const partitioned = partitionConflicts(fetched.records, existingIds);
    result.conflicts += await logConflicts(
      client,
      runId,
      mapping.sourceType,
      partitioned.conflicts,
    );

    const parentRows = partitioned.fresh.map(mapping.map);
    await resolveRelations(client, parentRows, mapping.relations);
    const insertedParents = await insertOnlyParents(
      client,
      mapping.table,
      parentRows,
    );
    result.inserted = insertedParents.length;

    const insertedIds = new Set(
      insertedParents.map((row) => row.legacy_id),
    );
    const racingConflicts = partitioned.fresh.filter((record) =>
      !insertedIds.has(requireLegacyId(record))
    );
    result.conflicts += await logConflicts(
      client,
      runId,
      mapping.sourceType,
      racingConflicts,
    );

    const insertedRecords = partitioned.fresh.filter((record) =>
      insertedIds.has(requireLegacyId(record))
    );
    if (mapping.children && insertedRecords.length) {
      const insertedLegacyIds = insertedRecords.map(requireLegacyId);
      const allParentRows = await legacyIdRows(
        client,
        mapping.table,
        insertedLegacyIds,
      );
      const parentIds = new Map(
        allParentRows.map((row) => [row.legacy_id, row.id]),
      );
      if (parentIds.size !== new Set(insertedLegacyIds).size) {
        throw new Error("Unable to resolve newly inserted parent rows.");
      }
      for (const child of mapping.children(insertedRecords, parentIds)) {
        await resolveRelations(client, child.rows, child.relations);
        result.junctionsInserted += await insertOnlyJunctions(
          client,
          child.table,
          child.onConflict,
          child.rows,
        );
      }
    }

    if (canAdvanceCheckpoint(true, false, false)) {
      await advanceCheckpoint(
        client,
        checkpoint,
        watermark,
        runId,
        result.inserted,
        result.conflicts,
      );
    }
    result.status = "completed";
    return result;
  } catch (error) {
    result.status = "failed";
    result.error = errorCode(error);
    result.errorDetail = safeError(error);
    console.error(
      `bubble-daily-incremental source failed: ${mapping.sourceType} (${result.error})`,
    );
    return result;
  }
}

async function handleRequest(request: Request): Promise<Response> {
  const invocationStartedAt = new Date().toISOString();
  const watermark = invocationStartedAt;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let client: AdminClient;
  try {
    client = createClient<any>(requiredEnv("SUPABASE_URL"), serviceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch {
    console.error("bubble-daily-incremental configuration error");
    return jsonResponse({ error: "Function is not configured." }, 500);
  }
  if (!(await authenticateCron(request, client))) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }
  let bubbleToken: string;
  try {
    bubbleToken = requiredEnv("BUBBLE_API_TOKEN")
      .replace(/^Bearer\s+/i, "")
      .trim();
    if (!bubbleToken) throw new Error("Bubble token is empty.");
  } catch {
    console.error("bubble-daily-incremental Bubble token is not configured");
    return jsonResponse({ error: "Function is not configured." }, 500);
  }

  let phases: Phase[];
  let requestedSourceType: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    phases = selectedPhases(body?.phase);
    if (body?.sourceType != null) {
      if (
        typeof body.sourceType !== "string" ||
        !body.sourceType ||
        body.sourceType.length > 120
      ) {
        throw new Error("sourceType must be a valid Bubble type.");
      }
      requestedSourceType = body.sourceType;
    }
  } catch (error) {
    return jsonResponse({ error: safeError(error) }, 400);
  }

  const invocationId = crypto.randomUUID();
  const migrationKey =
    `bubble-incremental-${invocationStartedAt}-${invocationId}`;
  const { data: run, error: runError } = await client
    .from("migration")
    .insert({
      migration_key: migrationKey,
      mode: "incremental",
      status: "running",
      source_system: "bubble",
      target_system: "supabase",
      snapshot_at: watermark,
      checkpoint_at: INITIAL_CHECKPOINT,
      started_at: invocationStartedAt,
      details: {
        invocation_id: invocationId,
        requested_phases: phases,
        requested_source_type: requestedSourceType,
        watermark,
      },
    })
    .select("id")
    .single();
  if (runError || !run) {
    console.error("bubble-daily-incremental could not create migration run");
    return jsonResponse({ error: "Unable to create migration run." }, 500);
  }

  const runId = run.id as string;
  const mappings = [...coreMappings, ...remainingMappings].filter((mapping) =>
    phases.includes(mapping.phase) &&
    (!requestedSourceType || mapping.sourceType === requestedSourceType)
  );
  if (requestedSourceType && mappings.length !== 1) {
    await client.from("migration").update({
      status: "failed",
      records_failed: 1,
      error_count: 1,
      completed_at: new Date().toISOString(),
      details: {
        invocation_id: invocationId,
        requested_phases: phases,
        requested_source_type: requestedSourceType,
        error: "source_type_not_mapped_in_phase",
      },
    }).eq("id", runId);
    return jsonResponse(
      { error: "Source type is not mapped in phase.", runId },
      400,
    );
  }
  const unsupported = phases.flatMap((phase) =>
    unsupportedMappings[phase].map((mapping) => ({ phase, mapping }))
  );
  const results: TypeResult[] = [];
  const deadline = Date.parse(invocationStartedAt) + SOFT_RUNTIME_MS;

  for (const mapping of mappings) {
    if (Date.now() >= deadline) {
      results.push({
        sourceType: mapping.sourceType,
        table: mapping.table,
        checkpoint: "",
        watermark,
        fetched: 0,
        inserted: 0,
        conflicts: 0,
        junctionsInserted: 0,
        pages: 0,
        status: "resumable",
      });
      break;
    }
    const result = await processType(
      client,
      mapping,
      runId,
      watermark,
      bubbleToken,
      deadline,
    );
    results.push(result);
    if (result.status !== "completed") break;
  }

  const aggregate = results.reduce(
    (total, result) => ({
      fetched: total.fetched + result.fetched,
      inserted: total.inserted + result.inserted,
      conflicts: total.conflicts + result.conflicts,
      junctionsInserted: total.junctionsInserted + result.junctionsInserted,
    }),
    { fetched: 0, inserted: 0, conflicts: 0, junctionsInserted: 0 },
  );
  const failed = results.filter((result) => result.status === "failed");
  const resumable = results.some((result) => result.status === "resumable");
  const status = failed.length ? "failed" : resumable ? "paused" : "completed";
  const completedAt = new Date().toISOString();
  const details = {
    invocation_id: invocationId,
    requested_phases: phases,
    requested_source_type: requestedSourceType,
    watermark,
    source_types: results,
    unsupported_mappings: unsupported,
    aggregate,
    resumable,
  };

  const { error: finishError } = await client
    .from("migration")
    .update({
      status,
      records_expected: aggregate.fetched,
      records_processed: aggregate.inserted + aggregate.conflicts,
      records_failed: failed.length,
      error_count: failed.length,
      completed_at: status === "paused" ? null : completedAt,
      details,
      updated_at: completedAt,
    })
    .eq("id", runId);
  if (finishError) {
    console.error("bubble-daily-incremental could not finalize migration run");
    return jsonResponse(
      { error: "Unable to finalize migration run.", runId },
      500,
    );
  }

  const responseBody = {
    runId,
    status,
    watermark,
    phases,
    aggregate,
    sourceTypes: results.map((result) => ({
      sourceType: result.sourceType,
      table: result.table,
      status: result.status,
      fetched: result.fetched,
      inserted: result.inserted,
      conflicts: result.conflicts,
      junctionsInserted: result.junctionsInserted,
      pages: result.pages,
      error: result.error,
      errorDetail: result.errorDetail,
    })),
    unsupportedMappings: unsupported,
    resumable,
  };
  if (failed.length) return jsonResponse(responseBody, 500);
  if (resumable) return jsonResponse(responseBody, 202);
  return jsonResponse(responseBody);
}

Deno.serve(async (request) => {
  try {
    return await handleRequest(request);
  } catch (error) {
    console.error("bubble-daily-incremental unhandled error");
    return jsonResponse(
      { error: "Unhandled synchronization error.", detail: safeError(error) },
      500,
    );
  }
});
