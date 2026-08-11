import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_HOST = "cs.foodchannels-catering.com";
const ALLOWED_PATHS = new Set([
  "/api/1.1/obj",
  "/version-test/api/1.1/obj",
]);
const CONFIRMATION_TEXT = "CLEAR RESEARCH DATA AND MIGRATE";
const PAGE_SIZE = 100;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type MigrationRequest = {
  action?: "reset" | "page" | "complete" | "status";
  baseUrl?: unknown;
  confirmation?: unknown;
  runId?: unknown;
  sourceType?: unknown;
  cursor?: unknown;
};

type BubbleListResponse = {
  response?: {
    cursor?: number;
    results?: Array<Record<string, unknown>>;
    count?: number;
    remaining?: number;
  };
  message?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getServiceKey() {
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) return legacyKey;

  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    const defaultKey = (JSON.parse(keys) as Record<string, string>).default;
    if (defaultKey) return defaultKey;
  }

  throw new Error("Supabase service credential is unavailable.");
}

function validateBaseUrl(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("Bubble Base URL is required.");
  }

  const url = new URL(value.trim());
  const pathname = url.pathname.replace(/\/+$/, "");

  if (
    url.protocol !== "https:" ||
    url.hostname !== ALLOWED_HOST ||
    !ALLOWED_PATHS.has(pathname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Only the FCCD production or version-test Bubble Data API is allowed.",
    );
  }

  return `${url.origin}${pathname}`;
}

function validateRunId(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new Error("A valid migration run ID is required.");
  }
  return value;
}

function parseDate(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const body = (await request.json()) as MigrationRequest;
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) throw new Error("Supabase URL is unavailable.");

    const supabase = createClient(supabaseUrl, getServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (body.action === "reset") {
      if (body.confirmation !== CONFIRMATION_TEXT) {
        return jsonResponse({ error: "Confirmation sentence does not match." }, 403);
      }

      const baseUrl = validateBaseUrl(body.baseUrl);
      const now = new Date().toISOString();
      const { error: cancelError } = await supabase
        .from("migration_runs")
        .update({ status: "cancelled", finished_at: now })
        .eq("status", "running");
      if (cancelError) throw cancelError;

      const { error: clearRecordsError } = await supabase
        .from("migration_bubble_records")
        .delete()
        .not("legacy_id", "is", null);
      if (clearRecordsError) throw clearRecordsError;

      const { data: catalog, error: catalogError } = await supabase
        .from("migration_entity_catalog")
        .select("source_type")
        .eq("enabled", true)
        .order("sort_order");
      if (catalogError) throw catalogError;
      if (!catalog?.length) throw new Error("Migration entity catalog is empty.");

      const { data: run, error: runError } = await supabase
        .from("migration_runs")
        .insert({
          source_base_url: baseUrl,
          reset_before_import: true,
          requested_types: catalog.length,
          confirmation_text: CONFIRMATION_TEXT,
        })
        .select("id, source_base_url, requested_types, started_at")
        .single();
      if (runError) throw runError;

      const { error: progressError } = await supabase
        .from("migration_progress")
        .insert(
          catalog.map(({ source_type }) => ({
            run_id: run.id,
            source_type,
          })),
        );
      if (progressError) throw progressError;

      return jsonResponse({
        run,
        sourceTypes: catalog.map(({ source_type }) => source_type),
      });
    }

    const runId = validateRunId(body.runId);

    if (body.action === "status") {
      const [{ data: run, error: runError }, { data: progress, error: progressError }] =
        await Promise.all([
          supabase.from("migration_runs").select("*").eq("id", runId).single(),
          supabase
            .from("migration_progress")
            .select("*")
            .eq("run_id", runId)
            .order("source_type"),
        ]);
      if (runError) throw runError;
      if (progressError) throw progressError;
      return jsonResponse({ run, progress });
    }

    if (body.action === "page") {
      if (typeof body.sourceType !== "string") {
        throw new Error("Source type is required.");
      }
      const cursor =
        typeof body.cursor === "number" &&
        Number.isInteger(body.cursor) &&
        body.cursor >= 0
          ? body.cursor
          : 0;

      const [{ data: run, error: runError }, { data: entity, error: entityError }] =
        await Promise.all([
          supabase
            .from("migration_runs")
            .select("id, source_base_url, status")
            .eq("id", runId)
            .single(),
          supabase
            .from("migration_entity_catalog")
            .select("source_type")
            .eq("source_type", body.sourceType)
            .eq("enabled", true)
            .single(),
        ]);
      if (runError) throw runError;
      if (entityError || !entity) throw new Error("Unknown migration entity.");
      if (run.status !== "running") {
        throw new Error("Migration run is not active.");
      }

      const progressUpdate: Record<string, unknown> = {
        status: "running",
        error_message: null,
        updated_at: new Date().toISOString(),
      };
      if (cursor === 0) {
        progressUpdate.started_at = new Date().toISOString();
      }

      await supabase
        .from("migration_progress")
        .update(progressUpdate)
        .eq("run_id", runId)
        .eq("source_type", entity.source_type);

      const sourceUrl = `${run.source_base_url}/${encodeURIComponent(entity.source_type)}`;
      const bubbleToken = Deno.env.get("BUBBLE_API_TOKEN")?.trim();
      const headers: HeadersInit = { Accept: "application/json" };
      if (bubbleToken) headers.Authorization = `Bearer ${bubbleToken}`;

      const bubbleResponse = await fetch(
        `${sourceUrl}?limit=${PAGE_SIZE}&cursor=${cursor}`,
        {
          headers,
          signal: AbortSignal.timeout(30_000),
        },
      );
      const payload = (await bubbleResponse.json().catch(() => null)) as
        | BubbleListResponse
        | null;

      if (!bubbleResponse.ok || !Array.isArray(payload?.response?.results)) {
        const message =
          payload?.message ||
          `Bubble API returned HTTP ${bubbleResponse.status}.`;
        await supabase
          .from("migration_progress")
          .update({
            status: "failed",
            error_message: message,
            updated_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          })
          .eq("run_id", runId)
          .eq("source_type", entity.source_type);
        return jsonResponse({ error: message }, 502);
      }

      const results = payload.response.results;
      const records = results
        .filter((record) => typeof record._id === "string" && record._id)
        .map((record) => ({
          source_type: entity.source_type,
          legacy_id: record._id as string,
          payload: record,
          source_created_at: parseDate(record["Created Date"]),
          source_modified_at: parseDate(record["Modified Date"]),
          source_slug: typeof record.Slug === "string" ? record.Slug : null,
          run_id: runId,
          migrated_at: new Date().toISOString(),
        }));

      if (records.length) {
        const { error: upsertError } = await supabase
          .from("migration_bubble_records")
          .upsert(records, { onConflict: "source_type,legacy_id" });
        if (upsertError) throw upsertError;
      }

      const responseCursor = payload.response.cursor ?? cursor;
      const responseCount = payload.response.count ?? results.length;
      const nextCursor = responseCursor + responseCount;
      const remaining = payload.response.remaining ?? 0;
      const done = remaining === 0 || responseCount === 0;
      const completedAt = done ? new Date().toISOString() : null;

      const { error: updateError } = await supabase
        .from("migration_progress")
        .update({
          status: done ? "completed" : "running",
          next_cursor: nextCursor,
          source_count: nextCursor + remaining,
          imported_count: nextCursor,
          updated_at: new Date().toISOString(),
          completed_at: completedAt,
        })
        .eq("run_id", runId)
        .eq("source_type", entity.source_type);
      if (updateError) throw updateError;

      return jsonResponse({
        sourceType: entity.source_type,
        imported: records.length,
        importedTotal: nextCursor,
        sourceCount: nextCursor + remaining,
        nextCursor,
        done,
      });
    }

    if (body.action === "complete") {
      const [{ data: progress, error: progressError }, recordsResult] =
        await Promise.all([
          supabase
            .from("migration_progress")
            .select("status, error_message")
            .eq("run_id", runId),
          supabase
            .from("migration_bubble_records")
            .select("*", { count: "exact", head: true }),
        ]);
      if (progressError) throw progressError;
      if (recordsResult.error) throw recordsResult.error;

      const failed = progress?.filter(({ status }) => status === "failed") ?? [];
      const completed =
        progress?.filter(({ status }) => status === "completed") ?? [];
      const unfinished =
        progress?.filter(
          ({ status }) => status === "pending" || status === "running",
        ) ?? [];
      if (unfinished.length) {
        return jsonResponse(
          {
            error: `${unfinished.length} migration entities are still unfinished.`,
          },
          409,
        );
      }
      const status = failed.length ? "completed_with_errors" : "completed";
      const { data: run, error: completeError } = await supabase
        .from("migration_runs")
        .update({
          status,
          completed_types: completed.length,
          failed_types: failed.length,
          imported_records: recordsResult.count ?? 0,
          errors: failed.map(({ error_message }) => error_message),
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId)
        .select("*")
        .single();
      if (completeError) throw completeError;
      return jsonResponse({ run });
    }

    throw new Error("Unknown migration action.");
  } catch (error) {
    return jsonResponse(
      {
        error: errorMessage(error, "Migration request failed."),
      },
      400,
    );
  }
});

