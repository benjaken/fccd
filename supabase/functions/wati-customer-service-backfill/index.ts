import { createClient } from "npm:@supabase/supabase-js@2";

import {
  normalizeWhatsAppChannel,
} from "../_shared/wati-customer-service-adapter.ts";
import {
  isIgnoredCustomerServicePhone,
  sanitizeCustomerServiceContextText,
  type CustomerServiceContextMessageRow,
} from "../_shared/customer-service-context.ts";
import {
  extractWatiConversationIds,
  fetchWatiContactRecords,
  fetchWatiConversationEvents,
  fetchWatiConversationMessagesV1,
  mapWithConcurrency,
  mapWatiHistoryMessages,
  probeWatiContacts,
  probeWatiHistory,
  type WatiContactRecord,
  type WatiHistoryMessage,
} from "../_shared/wati-conversation-history.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const DEFAULT_RUNTIME_MS = 100_000;
// Supabase kills a function around 150s; keep headroom for contact enumeration,
// finishRun and the response.
const MAX_RUNTIME_MS = 130_000;
const UPSERT_CHUNK = 500;
const READ_PAGE_SIZE = 1_000;
// Higher concurrency shortens the run; WATI 429/5xx are retried with backoff.
const DEFAULT_CONCURRENCY = 12;
const MAX_CONCURRENCY = 32;
const CONTACT_TTL_HOURS = 24;
/** Keep contacts active shortly before `since` so boundary messages are not missed. */
const ACTIVITY_BUFFER_MS = 6 * 60 * 60 * 1_000;

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
        // Merge so a re-import can refresh the role and sender metadata of
        // rows that were classified before the automated-reply detection.
        ignoreDuplicates: false,
      });
    if (error) throw error;
    stored += chunk.length;
  }
  return stored;
}

type WatiCreds = { endpoint: string; tokens: string[]; tenantId: string };

type ContactRow = {
  environment: string;
  phone: string;
  last_message_at: string | null;
  enumerated_at: string;
  updated_at: string;
};

type ProgressRow = {
  environment: string;
  phone: string;
  last_message_at: string | null;
  message_count: number;
  last_checked_at: string;
  checked_since: string | null;
  checked_until: string | null;
  updated_at: string;
};

/** 4) Returns the cached contact list when it is still fresh, else null. */
async function loadCachedContacts(
  admin: AdminClient,
  environment: string,
): Promise<WatiContactRecord[] | null> {
  const sinceIso = new Date(Date.now() - CONTACT_TTL_HOURS * 3_600_000).toISOString();
  const records: WatiContactRecord[] = [];
  // PostgREST caps a single response at ~1000 rows, so page through.
  for (let offset = 0; offset < 200_000; offset += READ_PAGE_SIZE) {
    const { data, error } = await admin
      .from("customer_service_learning_import_contacts")
      .select("phone, last_message_at")
      .eq("environment", environment)
      .gte("enumerated_at", sinceIso)
      .order("phone", { ascending: true })
      .range(offset, offset + READ_PAGE_SIZE - 1);
    if (error) {
      console.error("load cached contacts failed", error.message.slice(0, 300));
      return null;
    }
    const page = (data ?? []) as Array<Record<string, unknown>>;
    for (const row of page) {
      records.push({ phone: String(row.phone), lastMessageAt: row.last_message_at ? String(row.last_message_at) : "" });
    }
    if (page.length < READ_PAGE_SIZE) break;
  }
  return records.length ? records : null;
}

async function storeContacts(
  admin: AdminClient,
  environment: string,
  records: readonly WatiContactRecord[],
) {
  const now = new Date().toISOString();
  const rows: ContactRow[] = records.map((record) => ({
    environment,
    phone: record.phone,
    last_message_at: record.lastMessageAt || null,
    enumerated_at: now,
    updated_at: now,
  }));
  for (let index = 0; index < rows.length; index += UPSERT_CHUNK) {
    const { error } = await admin
      .from("customer_service_learning_import_contacts")
      .upsert(rows.slice(index, index + UPSERT_CHUNK), { onConflict: "environment,phone" });
    if (error) console.error("store contacts failed", error.message.slice(0, 300));
  }
}

/**
 * 3) Phones whose recorded window fully covers the requested one are skipped.
 * The window a contact was imported for is `[checked_since, checked_until)`;
 * a request `[since, until)` is covered only when
 * `checked_since <= since` and `checked_until >= until`. Open-ended requests
 * are never skipped, and rows without a recorded window never match.
 */
async function loadCheckedPhones(
  admin: AdminClient,
  environment: string,
  since: string | null,
  until: string | null,
): Promise<Set<string>> {
  const checked = new Set<string>();
  if (!since || !until) return checked;
  for (let offset = 0; offset < 200_000; offset += READ_PAGE_SIZE) {
    const { data, error } = await admin
      .from("customer_service_learning_import_contacts")
      .select("phone")
      .eq("environment", environment)
      .lte("checked_since", since)
      .gte("checked_until", until)
      .order("phone", { ascending: true })
      .range(offset, offset + READ_PAGE_SIZE - 1);
    if (error) {
      console.error("load checked phones failed", error.message.slice(0, 300));
      return new Set();
    }
    const page = (data ?? []) as Array<Record<string, unknown>>;
    for (const row of page) checked.add(String(row.phone));
    if (page.length < READ_PAGE_SIZE) break;
  }
  return checked;
}

async function storeProgress(
  admin: AdminClient,
  environment: string,
  entries: ReadonlyArray<{ phone: string; lastMessageAt: string; messageCount: number }>,
  window: { since: string | null; until: string | null },
) {
  if (!entries.length) return;
  const now = new Date().toISOString();
  // An open-ended import covers everything up to now, so record `now` as the
  // covered end; a missing `since` stays null and simply never matches a
  // bounded request (it is re-fetched instead of wrongly skipped).
  const coveredUntil = window.until ?? now;
  const byPhone = new Map<string, ProgressRow>();
  for (const entry of entries) {
    byPhone.set(entry.phone, {
      environment,
      phone: entry.phone,
      last_message_at: entry.lastMessageAt || null,
      message_count: entry.messageCount,
      last_checked_at: now,
      checked_since: window.since,
      checked_until: coveredUntil,
      updated_at: now,
    });
  }
  const rows = [...byPhone.values()];
  for (let index = 0; index < rows.length; index += UPSERT_CHUNK) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK);
    const { error } = await admin
      .from("customer_service_learning_import_contacts")
      .upsert(chunk, { onConflict: "environment,phone" });
    if (!error) continue;
    // Fall back to one row at a time so a single bad row cannot drop the batch.
    console.error("store progress chunk failed", error.message.slice(0, 300));
    for (const row of chunk) {
      const { error: rowError } = await admin
        .from("customer_service_learning_import_contacts")
        .upsert(row, { onConflict: "environment,phone" });
      if (rowError) console.error("store progress row failed", row.phone, rowError.message.slice(0, 200));
    }
  }
}

/**
 * v3-by-phone only returns the latest open conversation; v1 getMessages is the
 * complete per-phone history used for learning import.
 */
async function collectPhoneHistoryMessages(
  creds: WatiCreds,
  phone: string,
  deadlineAt: number,
): Promise<WatiHistoryMessage[]> {
  return await fetchWatiConversationMessagesV1({
    endpoint: creds.endpoint,
    tokens: creds.tokens,
    tenantId: creds.tenantId,
    target: phone,
    deadlineAt,
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
    // The wall clock starts before enumerating contacts: on a large tenant that
    // call alone can take tens of seconds, and it must count against the budget
    // so the function returns before the platform timeout.
    const requestStartedAt = Date.now();
    const deadline = requestStartedAt + maxRuntimeMs;
    const cursor = (body.cursor && typeof body.cursor === "object")
      ? body.cursor as Record<string, unknown>
      : {};
    const isProbe = body.mode === "probe";
    const refreshContacts = body.refresh_contacts === true || body.refreshContacts === true;
    const cursorPhones = parsePhoneList(cursor.phones);
    const bodyPhones = parsePhoneList(body.phones);
    const activity = new Map<string, string>();
    let phones: string[] = [];
    let enumerated = false;
    if (cursorPhones.length) {
      phones = cursorPhones;
    } else if (bodyPhones.length) {
      phones = bodyPhones;
    } else {
      enumerated = true;
      // 4) Reuse a recent contact enumeration instead of re-listing 14k+ contacts.
      let records: WatiContactRecord[] | null = null;
      if (!refreshContacts) records = await loadCachedContacts(admin, environment);
      if (!records || !records.length) {
        records = await fetchWatiContactRecords({
          endpoint,
          tokens,
          tenantId: env("WATI_TENANT_ID"),
          log: console.error,
        });
        if (!isProbe) await storeContacts(admin, environment, records);
      }
      for (const record of records) activity.set(record.phone, record.lastMessageAt);
      // Stable order so `max_phones` slices the same candidates every run and
      // the incremental skip (last_checked_at) actually matches.
      phones = records.map((record) => record.phone).sort();
    }
    phones = phones.filter((phone) => !isIgnoredCustomerServicePhone(phone));
    // 1) Optional: only query contacts WATI marks as recently active. This is
    //    opt-in because WATI's `lastUpdated` does not track message activity for
    //    every contact (about half the phones with messages have a stale value),
    //    so it can skip phones that do have in-range messages.
    const activeOnly = body.active_only === true || body.activeOnly === true;
    if (activeOnly && since && activity.size) {
      const cutoff = Date.parse(since) - ACTIVITY_BUFFER_MS;
      phones = phones.filter((phone) => {
        const last = activity.get(phone);
        if (!last) return true;
        const parsed = Date.parse(last);
        return !Number.isFinite(parsed) || parsed >= cutoff;
      });
    }
    if (enumerated && maxPhones && phones.length > maxPhones) {
      phones = phones.slice(0, maxPhones);
    }
    // 3) Skip phones already checked for this window (incremental / negative cache).
    const checkedPhones = isProbe ? new Set<string>() : await loadCheckedPhones(admin, environment, since, until);
    const beforeSkip = phones.length;
    if (checkedPhones.size) phones = phones.filter((phone) => !checkedPhones.has(phone));
    const phonesSkipped = beforeSkip - phones.length;
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
      return jsonResponse({
        ok: true, mode: "probe", contacts_enumerated: phones.length,
        contacts: await probeWatiContacts({ ...creds, pageSize: 2 }),
        reports,
      });
    }

    const runId = await startRun(admin, {
      environment, since, until, phonesRequested: phones.length,
    });
    const errors: string[] = [];
    let messagesImported = 0;
    let processed = startIndex;

    while (processed < phones.length) {
      if (Date.now() >= deadline) break;
      const wave = phones.slice(processed, processed + concurrency);
      const results = await mapWithConcurrency(wave, concurrency, async (phone) => {
        if (Date.now() >= deadline) return { imported: 0, checked: false as const };
        try {
          const messages = await collectPhoneHistoryMessages(creds, phone, deadline);
          const rows = mapWatiHistoryMessages(messages, {
            phone,
            environment,
            since: since ?? undefined,
            until: until ?? undefined,
          });
          const imported = await upsertImportedRows(admin, rows);
          const lastMessageAt = messages.reduce(
            (latest, message) => (message.occurredAt > latest ? message.occurredAt : latest),
            "",
          );
          return { imported, checked: true as const, phone, lastMessageAt, messageCount: rows.length };
        } catch (error) {
          const detail = error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200);
          console.error("wati history import failed", phone, detail);
          return { imported: 0, checked: false as const, error: `${phone}:${detail}` };
        }
      });
      const progress: Array<{ phone: string; lastMessageAt: string; messageCount: number }> = [];
      for (const result of results) {
        messagesImported += result.imported;
        if ("error" in result && result.error) errors.push(result.error);
        if (result.checked) {
          progress.push({ phone: result.phone, lastMessageAt: result.lastMessageAt, messageCount: result.messageCount });
        }
      }
      if (progress.length) await storeProgress(admin, environment, progress, { since, until });
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
      phones_skipped: phonesSkipped,
      messages_imported: messagesImported,
      concurrency,
      elapsed_ms: Date.now() - requestStartedAt,
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
