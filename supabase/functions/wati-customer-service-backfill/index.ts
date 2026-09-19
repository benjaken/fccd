import { createClient } from "npm:@supabase/supabase-js@2";

import {
  normalizeWhatsAppChannel,
} from "../_shared/wati-customer-service-adapter.ts";
import {
  sanitizeCustomerServiceContextText,
  type CustomerServiceContextMessageRow,
} from "../_shared/customer-service-context.ts";
import {
  extractWatiConversationIds,
  fetchWatiContactPhones,
  fetchWatiConversationEvents,
  fetchWatiConversationMessagesV1,
  mapWithConcurrency,
  mapWatiHistoryMessages,
  probeWatiHistory,
  type WatiHistoryMessage,
} from "../_shared/wati-conversation-history.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const DEFAULT_RUNTIME_MS = 100_000;
const MAX_RUNTIME_MS = 150_000;
const UPSERT_CHUNK = 500;
const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 8;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function env(name: string) {
  return Deno.env.get(name)?.trim() || "";
}

function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = env(name);
    if (value) return value;
  }
  return "";
}

function serviceRoleKey() {
  const legacy = env("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const configured = env("SUPABASE_SECRET_KEYS");
  if (configured) {
    const keys = JSON.parse(configured) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  throw new Error("missing_supabase_service_role_key");
}

function deploymentEnvironment() {
  return env("CUSTOMER_SERVICE_ENVIRONMENT") ||
    (env("SUPABASE_URL").includes("vignxasvlxqnyvuhtjlu") ? "production" : "develop");
}

type AdminClient = ReturnType<typeof createClient>;

async function authorize(request: Request, admin: AdminClient) {
  const configuredSecret = firstEnv(
    "CUSTOMER_SERVICE_IMPORT_CRON_SECRET",
    "CUSTOMER_SERVICE_REPORT_CRON_SECRET",
    "WATI_ORDER_CRON_SECRET",
  );
  const suppliedSecret = request.headers.get("x-cron-secret")?.trim() || "";
  if (configuredSecret && suppliedSecret === configuredSecret) return;

  const authorization = request.headers.get("authorization")?.trim() || "";
  if (!/^Bearer\s+\S+/i.test(authorization)) throw new Error("authentication_required");
  const { data, error } = await admin.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
  if (error || !data.user) throw new Error("authentication_required");
  const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: accessError } = await userClient.rpc("customer_service_controls_get");
  if (accessError) throw new Error("page_access_required");
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function optionalIsoDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function parsePhoneList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map((entry) => normalizeWhatsAppChannel(String(entry ?? "")))
      .filter(Boolean),
  )];
}

async function startRun(
  admin: AdminClient,
  input: {
    environment: string;
    since: string | null;
    until: string | null;
    phonesRequested: number;
  },
) {
  const { data, error } = await admin
    .from("customer_service_learning_import_runs")
    .insert({
      environment: input.environment,
      status: "running",
      since: input.since,
      until: input.until,
      phones_requested: input.phonesRequested,
    })
    .select("id")
    .single();
  if (error || !data) throw error || new Error("import_run_start_failed");
  return String(data.id);
}

async function finishRun(
  admin: AdminClient,
  runId: string,
  input: {
    status: "completed" | "partial" | "failed";
    phonesProcessed: number;
    messagesImported: number;
    errors: string[];
  },
) {
  const { error } = await admin
    .from("customer_service_learning_import_runs")
    .update({
      status: input.status,
      phones_processed: input.phonesProcessed,
      messages_imported: input.messagesImported,
      errors: input.errors.slice(0, 50),
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) console.error("import run finish failed", error.message.slice(0, 300));
}

async function upsertImportedRows(
  admin: AdminClient,
  rows: CustomerServiceContextMessageRow[],
) {
  if (!rows.length) return 0;
  let stored = 0;
  for (let index = 0; index < rows.length; index += UPSERT_CHUNK) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK);
    const { error } = await admin
      .from("customer_service_learning_import_messages")
      .upsert(chunk, {
        onConflict: "environment,source_message_id,role",
        ignoreDuplicates: true,
      });
    if (error) throw error;
    stored += chunk.length;
  }
  return stored;
}

type WatiCreds = { endpoint: string; tokens: string[]; tenantId: string };

/**
 * v3-by-phone only returns the latest open conversation; v1 getMessages is the
 * complete per-phone history used for learning import.
 */
async function collectPhoneHistoryMessages(
  creds: WatiCreds,
  phone: string,
): Promise<WatiHistoryMessage[]> {
  return await fetchWatiConversationMessagesV1({
    endpoint: creds.endpoint,
    tokens: creds.tokens,
    tenantId: creds.tenantId,
    target: phone,
    log: console.error,
  });
}

function optionalMaxPhones(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return clampInteger(value, 50, 1, 1_000);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const admin = createClient(env("SUPABASE_URL"), serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    await authorize(request, admin);

    const endpoint = firstEnv("WATI_API_ENDPOINT", "WATI_API_HOST");
    const tokens = [
      env("WATI_ACCESS_TOKEN"),
      env("WATI_API_TOKEN"),
    ].map((value) => value.replace(/^Bearer\s+/i, "").trim()).filter(Boolean);
    if (!endpoint || !tokens.length) {
      return jsonResponse({ error: "wati_credentials_missing" }, 500);
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const environment = deploymentEnvironment();
    const since = optionalIsoDate(body.since);
    const until = optionalIsoDate(body.until);
    const maxPhones = optionalMaxPhones(body.max_phones ?? body.maxPhones);
    const maxRuntimeMs = clampInteger(body.max_runtime_ms ?? body.maxRuntimeMs, DEFAULT_RUNTIME_MS, 1_000, MAX_RUNTIME_MS);
    const concurrency = clampInteger(body.concurrency, DEFAULT_CONCURRENCY, 1, MAX_CONCURRENCY);
    const cursor = (body.cursor && typeof body.cursor === "object")
      ? body.cursor as Record<string, unknown>
      : {};
    const cursorPhones = parsePhoneList(cursor.phones);
    let phones = cursorPhones.length ? cursorPhones : parsePhoneList(body.phones);
    const enumerated = !phones.length;
    if (!phones.length) {
      phones = await fetchWatiContactPhones({
        endpoint,
        tokens,
        tenantId: env("WATI_TENANT_ID"),
        log: console.error,
      });
    }
    if (enumerated && maxPhones && phones.length > maxPhones) {
      phones = phones.slice(0, maxPhones);
    }
    const startIndex = clampInteger(cursor.phone_index ?? cursor.phoneIndex, 0, 0, phones.length);
    const creds: WatiCreds = { endpoint, tokens, tenantId: env("WATI_TENANT_ID") };

    if (body.mode === "probe") {
      const reports: unknown[] = [];
      for (const phone of phones.slice(0, 3)) {
        try {
          const events = await fetchWatiConversationEvents({
            ...creds, target: phone, pageSize: 10, maxPages: 1, log: console.error,
          });
          const conversationIds = extractWatiConversationIds(events, 3);
          reports.push({
            phone,
            event_count: events.length,
            conversation_ids: conversationIds,
            event_sample: events.slice(0, 3).map((event) => ({
              ...event,
              description: sanitizeCustomerServiceContextText(event.description).slice(0, 120),
            })),
            probe: await probeWatiHistory({ ...creds, target: phone, conversationId: conversationIds[0] }),
          });
        } catch (error) {
          reports.push({
            phone,
            error: error instanceof Error ? error.message.slice(0, 200) : String(error),
          });
        }
      }
      return jsonResponse({ ok: true, mode: "probe", contacts_enumerated: phones.length, reports });
    }

    const runId = await startRun(admin, {
      environment, since, until, phonesRequested: phones.length,
    });
    const errors: string[] = [];
    const startedAt = Date.now();
    const deadline = startedAt + maxRuntimeMs;
    let messagesImported = 0;
    let processed = startIndex;

    while (processed < phones.length) {
      if (Date.now() >= deadline) break;
      const wave = phones.slice(processed, processed + concurrency);
      const results = await mapWithConcurrency(wave, concurrency, async (phone) => {
        try {
          const messages = await collectPhoneHistoryMessages(creds, phone);
          const rows = mapWatiHistoryMessages(messages, {
            phone,
            environment,
            since: since ?? undefined,
            until: until ?? undefined,
          });
          return { imported: await upsertImportedRows(admin, rows) };
        } catch (error) {
          const detail = error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200);
          console.error("wati history import failed", phone, detail);
          return { imported: 0, error: `${phone}:${detail}` };
        }
      });
      for (const result of results) {
        messagesImported += result.imported;
        if (result.error) errors.push(result.error);
      }
      processed += wave.length;
    }

    const done = processed >= phones.length;
    await finishRun(admin, runId, {
      status: !done ? "partial" : errors.length ? "partial" : "completed",
      phonesProcessed: processed,
      messagesImported,
      errors,
    });
    return jsonResponse({
      ok: true,
      run_id: runId,
      done,
      environment,
      phones_requested: phones.length,
      phones_processed: processed,
      messages_imported: messagesImported,
      concurrency,
      elapsed_ms: Date.now() - startedAt,
      errors: errors.slice(0, 20),
      next_cursor: done ? null : { phone_index: processed, phones },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "authentication_required" ? 401 : message === "page_access_required" ? 403 : 500;
    console.error("wati customer-service backfill failed", message.slice(0, 500));
    return jsonResponse({ error: "wati_customer_service_backfill_failed", detail: message.slice(0, 500) }, status);
  }
});
