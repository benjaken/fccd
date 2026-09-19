import {
  DEFAULT_WATI_TENANT_ID,
  normalizeWhatsAppChannel,
} from "./wati-customer-service-adapter.ts";
import {
  customerServiceContextMessageRow,
  sanitizeCustomerServiceContextText,
  type CustomerServiceContextMessageRow,
} from "./customer-service-context.ts";

export type WatiHistoryMessage = {
  id: string;
  text: string;
  type: string;
  occurredAt: string;
  owner: boolean;
  localMessageId: string;
  operatorName: string;
  operatorEmail: string;
  eventType: string;
};

export type WatiHistoryFetchInput = {
  endpoint: string;
  /** Single token; prefer `tokens` so an expired token can fall back to the next one. */
  token?: string;
  /** Tokens tried in order. WATI_ACCESS_TOKEN before WATI_API_TOKEN, matching the live bot. */
  tokens?: string[];
  tenantId?: string;
  fetchImpl?: typeof fetch;
  pageSize?: number;
  maxPages?: number;
  /** Base backoff for retryable responses (429/5xx); mainly lowered in tests. */
  retryDelayMs?: number;
  log?: (...args: unknown[]) => void;
};

/** Runs `worker` over `items` with at most `limit` in flight, preserving order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const size = Math.max(1, Math.min(Math.trunc(limit) || 1, items.length || 1));
  let next = 0;
  const run = async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: size }, run));
  return results;
}

type WatiTargetInput = WatiHistoryFetchInput & { target?: string; phone?: string };

function resolveTarget(input: WatiTargetInput) {
  return input.target ?? input.phone ?? "";
}

function tokenList(input: WatiHistoryFetchInput) {
  return [...(input.tokens ?? []), input.token ?? ""]
    .map((token) => token.replace(/^Bearer\s+/i, "").trim())
    .filter(Boolean)
    .filter((token, index, all) => all.indexOf(token) === index);
}

/** Tries each token once and remembers the first that is not rejected with 401. */
function tokenFetcher(tokens: string[], fetchImpl: typeof fetch, retryDelayMs = 500) {
  let index = 0;
  return async (url: string) => {
    let lastError: unknown;
    for (; index < tokens.length; index += 1) {
      try {
        return await watiGetJson(url, tokens[index], fetchImpl, retryDelayMs);
      } catch (error) {
        if (error instanceof WatiHistoryHttpError && error.status === 401) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    if (lastError instanceof WatiHistoryHttpError) throw lastError;
    throw new WatiHistoryHttpError(401, "missing_token");
  };
}

export class WatiHistoryHttpError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(`wati_history_http_${status}:${detail}`);
    this.status = status;
  }
}

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 200;

export function resolveWatiApiBase(endpoint: string, tenantId = "") {
  const trimmed = endpoint.trim().replace(/\/+$/, "").replace(/\/api\/.*$/i, "");
  try {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/+$/, "");
    if (path && !/^\/api(\/|$)/i.test(path)) return `${url.origin}${path}`;
    const tenant = tenantId.trim()
      || (url.hostname.includes("wati.io") ? DEFAULT_WATI_TENANT_ID : "");
    return tenant ? `${url.origin}/${tenant}` : url.origin;
  } catch {
    return trimmed;
  }
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_REQUEST_RETRIES = 2;

async function watiGetJson(
  url: string,
  token: string,
  fetchImpl: typeof fetch,
  retryDelayMs = 500,
): Promise<unknown> {
  let lastError: WatiHistoryHttpError | null = null;
  for (let attempt = 0; attempt <= MAX_REQUEST_RETRIES; attempt += 1) {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token.replace(/^Bearer\s+/i, "").trim()}`,
        "Content-Type": "application/json",
      },
    });
    const raw = await response.text();
    if (response.ok) {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        throw new WatiHistoryHttpError(response.status, "invalid_json");
      }
    }
    const error = new WatiHistoryHttpError(response.status, raw.slice(0, 300));
    if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_REQUEST_RETRIES) {
      throw error;
    }
    lastError = error;
    const retryAfter = Number(response.headers?.get?.("retry-after") ?? "");
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1_000
      : retryDelayMs * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 5_000)));
  }
  throw lastError ?? new WatiHistoryHttpError(0, "request_failed");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

/**
 * WATI is inconsistent: `created` is ISO8601 while `timestamp` is epoch seconds
 * (they mix numeric types), so both shapes are normalised here.
 */
export function normalizeWatiTimestamp(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      const ms = numeric > 1e12 ? numeric : numeric * 1000;
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? "" : date.toISOString();
    }
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? "" : new Date(parsed).toISOString();
}

export function normalizeWatiHistoryItem(payload: unknown): WatiHistoryMessage | null {
  const item = asRecord(payload);
  const id = firstString(item.id, item.messageId, item.whatsappMessageId);
  const occurredAt = normalizeWatiTimestamp(
    firstString(item.created, item.createdAt, item.timestamp, item.time, item.occurredAt),
  );
  if (!id || !occurredAt) return null;
  return {
    id,
    text: firstString(
      item.text,
      item.finalText,
      item.translationText,
      item.messageText,
      item.message,
      item.body,
      item.caption,
    ),
    type: firstString(item.type, item.messageType).toLowerCase(),
    occurredAt,
    owner: item.owner === true || item.owner === 1 || item.fromMe === true || item.fromMe === 1,
    localMessageId: firstString(item.local_message_id, item.localMessageId),
    operatorName: firstString(item.operator_name, item.operatorName, item.operator),
    operatorEmail: firstString(item.operator_email, item.operatorEmail),
    eventType: firstString(item.event_type, item.eventType).toLowerCase() || "message",
  };
}

/**
 * Outbound bot replies carry the `fcc-bot-` local id prefix; other outbound
 * messages are operator replies. Broadcast/template events have no `owner`
 * flag in the v1 feed, so their event type marks them as outbound too.
 */
export function classifyWatiHistoryRole(message: WatiHistoryMessage): "customer" | "assistant" | "human" {
  const outbound = message.owner || /broadcast|template/i.test(message.eventType);
  if (!outbound) return "customer";
  if (message.localMessageId.startsWith("fcc-bot-")) return "assistant";
  if (message.operatorEmail) return "human";
  if (message.operatorName && !/^(api|bot|system|wati)$/i.test(message.operatorName)) {
    return "human";
  }
  return "assistant";
}

export function mapWatiHistoryMessages(
  messages: readonly WatiHistoryMessage[],
  input: {
    phone: string;
    environment: string;
    since?: string;
    until?: string;
  },
): CustomerServiceContextMessageRow[] {
  const since = input.since ? Date.parse(input.since) : Number.NaN;
  const until = input.until ? Date.parse(input.until) : Number.NaN;
  const rows: CustomerServiceContextMessageRow[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    const occurred = Date.parse(message.occurredAt);
    if (!Number.isNaN(since) && occurred < since) continue;
    if (!Number.isNaN(until) && occurred >= until) continue;
    const role = classifyWatiHistoryRole(message);
    const key = `${message.id}\0${role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = customerServiceContextMessageRow({
      sourceMessageId: message.id,
      phone: input.phone,
      role,
      text: message.text,
      environment: input.environment,
      occurredAt: message.occurredAt,
    });
    if (row) rows.push(row);
  }
  return rows;
}

function pageItems(payload: unknown, keys: string[]): unknown[] {
  const record = asRecord(payload);
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

export async function fetchWatiConversationMessages(
  input: WatiTargetInput,
): Promise<WatiHistoryMessage[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = resolveWatiApiBase(input.endpoint, input.tenantId ?? "");
  const target = resolveTarget(input);
  const pageSize = Math.min(Math.max(input.pageSize ?? DEFAULT_PAGE_SIZE, 1), 100);
  const maxPages = Math.max(input.maxPages ?? DEFAULT_MAX_PAGES, 1);
  const log = input.log ?? (() => {});
  const getJson = tokenFetcher(tokenList(input), fetchImpl, input.retryDelayMs);
  const messages: WatiHistoryMessage[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const url = `${base}/api/ext/v3/conversations/${encodeURIComponent(target)}/messages`
      + `?page_number=${page}&page_size=${pageSize}`;
    let items: unknown[];
    try {
      items = pageItems(await getJson(url), ["message_list", "messages"]);
    } catch (error) {
      if (error instanceof WatiHistoryHttpError && [401, 403, 404, 405].includes(error.status)) {
        log("wati history v3 unavailable, falling back to v1", target, error.status);
        return fetchWatiConversationMessagesV1({ ...input, fetchImpl });
      }
      throw error;
    }
    for (const item of items) {
      const normalized = normalizeWatiHistoryItem(item);
      if (normalized) messages.push(normalized);
    }
    if (items.length < pageSize) break;
  }
  return messages;
}

export async function fetchWatiConversationMessagesV1(
  input: WatiTargetInput,
): Promise<WatiHistoryMessage[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = resolveWatiApiBase(input.endpoint, input.tenantId ?? "");
  const pageSize = Math.min(Math.max(input.pageSize ?? DEFAULT_PAGE_SIZE, 1), 100);
  const maxPages = Math.max(input.maxPages ?? DEFAULT_MAX_PAGES, 1);
  const getJson = tokenFetcher(tokenList(input), fetchImpl, input.retryDelayMs);
  const target = resolveTarget(input);
  const messages: WatiHistoryMessage[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const url = `${base}/api/v1/getMessages/${encodeURIComponent(target)}`
      + `?pageSize=${pageSize}&pageNumber=${page}`;
    const payload = asRecord(await getJson(url));
    const messagesRecord = asRecord(payload.messages);
    const items = Array.isArray(messagesRecord.items) ? messagesRecord.items : [];
    for (const item of items) {
      const normalized = normalizeWatiHistoryItem(item);
      if (normalized) messages.push(normalized);
    }
    if (items.length < pageSize) break;
  }
  return messages;
}

export type WatiConversationEvent = {
  id: string;
  conversationId: string;
  eventType: string;
  occurredAt: string;
  description: string;
};

/**
 * The v3 "Get messages" endpoint by phone only returns the most recent *open*
 * conversation, so historical chats are reached through the conversation ids
 * listed by the v1 getMessages event feed.
 */
export async function fetchWatiConversationEvents(
  input: WatiTargetInput,
): Promise<WatiConversationEvent[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = resolveWatiApiBase(input.endpoint, input.tenantId ?? "");
  const pageSize = Math.min(Math.max(input.pageSize ?? DEFAULT_PAGE_SIZE, 1), 100);
  const maxPages = Math.max(input.maxPages ?? DEFAULT_MAX_PAGES, 1);
  const getJson = tokenFetcher(tokenList(input), fetchImpl, input.retryDelayMs);
  const target = resolveTarget(input);
  const events: WatiConversationEvent[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const url = `${base}/api/v1/getMessages/${encodeURIComponent(target)}`
      + `?pageSize=${pageSize}&pageNumber=${page}`;
    const payload = asRecord(await getJson(url));
    const items = pageItems(asRecord(payload.messages), ["items"]);
    for (const item of items) {
      const record = asRecord(item);
      const conversationId = firstString(record.conversationId, record.conversation_id);
      if (!conversationId) continue;
      const occurredAt = normalizeWatiTimestamp(firstString(record.created, record.timestamp, record.time));
      events.push({
        id: firstString(record.id),
        conversationId,
        eventType: firstString(record.eventType, record.event_type).toLowerCase(),
        occurredAt,
        description: firstString(record.eventDescription, record.description),
      });
    }
    if (items.length < pageSize) break;
  }
  return events;
}

export function extractWatiConversationIds(
  events: readonly WatiConversationEvent[],
  limit = 20,
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const event of events) {
    if (!event.conversationId || seen.has(event.conversationId)) continue;
    seen.add(event.conversationId);
    ids.push(event.conversationId);
    if (ids.length >= limit) break;
  }
  return ids;
}

function truncateForProbe(payload: unknown, itemLimit = 5): unknown {
  const record = asRecord(payload);
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      output[key] = value.slice(0, itemLimit).map((item) => {
        const row = asRecord(item);
        const trimmed: Record<string, unknown> = {};
        for (const [field, raw] of Object.entries(row)) {
          trimmed[field] = typeof raw === "string"
            ? sanitizeCustomerServiceContextText(raw).slice(0, 120)
            : raw;
        }
        return trimmed;
      });
    } else if (value && typeof value === "object") {
      output[key] = truncateForProbe(value, itemLimit);
    } else {
      output[key] = typeof value === "string"
        ? sanitizeCustomerServiceContextText(value).slice(0, 200)
        : value;
    }
  }
  return output;
}

/** Read-only raw sample used to diagnose why a backfill returned no messages. */
export async function probeWatiHistory(
  input: WatiTargetInput & { conversationId?: string },
): Promise<Record<string, unknown>> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = resolveWatiApiBase(input.endpoint, input.tenantId ?? "");
  const getJson = tokenFetcher(tokenList(input), fetchImpl, input.retryDelayMs);
  const target = resolveTarget(input);
  const report: Record<string, unknown> = { target };
  const attempt = async (label: string, url: string) => {
    try {
      report[label] = truncateForProbe(await getJson(url));
    } catch (error) {
      report[label] = {
        error: error instanceof Error ? error.message.slice(0, 200) : String(error),
      };
    }
  };
  await attempt("v3_by_phone",
    `${base}/api/ext/v3/conversations/${encodeURIComponent(target)}/messages?page_number=1&page_size=10`);
  await attempt("v1_events",
    `${base}/api/v1/getMessages/${encodeURIComponent(target)}?pageSize=10&pageNumber=1`);
  if (input.conversationId) {
    await attempt("v3_by_conversation",
      `${base}/api/ext/v3/conversations/${encodeURIComponent(input.conversationId)}/messages?page_number=1&page_size=10`);
  }
  return report;
}

export async function fetchWatiContactPhones(
  input: WatiHistoryFetchInput,
): Promise<string[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = resolveWatiApiBase(input.endpoint, input.tenantId ?? "");
  const pageSize = Math.min(Math.max(input.pageSize ?? DEFAULT_PAGE_SIZE, 1), 100);
  const maxPages = Math.max(input.maxPages ?? DEFAULT_MAX_PAGES, 1);
  const log = input.log ?? (() => {});
  const getJson = tokenFetcher(tokenList(input), fetchImpl, input.retryDelayMs);
  const phones = new Set<string>();
  for (let page = 1; page <= maxPages; page += 1) {
    const url = `${base}/api/ext/v3/contacts?page_number=${page}&page_size=${pageSize}`;
    let items: unknown[];
    try {
      items = pageItems(await getJson(url), ["contact_list", "contacts"]);
    } catch (error) {
      if (error instanceof WatiHistoryHttpError && [401, 403, 404, 405].includes(error.status)) {
        log("wati contacts v3 unavailable, falling back to v1", error.status);
        return fetchWatiContactPhonesV1({ ...input, fetchImpl });
      }
      throw error;
    }
    for (const item of items) {
      const record = asRecord(item);
      const phone = normalizeWhatsAppChannel(
        firstString(record.phone, record.wa_id, record.whatsappNumber),
      );
      if (phone) phones.add(phone);
    }
    if (items.length < pageSize) break;
  }
  return [...phones];
}

async function fetchWatiContactPhonesV1(
  input: WatiHistoryFetchInput,
): Promise<string[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = resolveWatiApiBase(input.endpoint, input.tenantId ?? "");
  const pageSize = Math.min(Math.max(input.pageSize ?? DEFAULT_PAGE_SIZE, 1), 100);
  const maxPages = Math.max(input.maxPages ?? DEFAULT_MAX_PAGES, 1);
  const getJson = tokenFetcher(tokenList(input), fetchImpl, input.retryDelayMs);
  const phones = new Set<string>();
  for (let page = 1; page <= maxPages; page += 1) {
    const url = `${base}/api/v1/getContacts?pageSize=${pageSize}&pageNumber=${page}`;
    const payload = asRecord(await getJson(url));
    const items = pageItems(payload, ["contact_list", "contacts"]);
    for (const item of items) {
      const record = asRecord(item);
      const phone = normalizeWhatsAppChannel(
        firstString(record.phone, record.wa_id, record.whatsappNumber),
      );
      if (phone) phones.add(phone);
    }
    if (items.length < pageSize) break;
  }
  return [...phones];
}
