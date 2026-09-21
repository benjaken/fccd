import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { mergeLearningMessages } from "../supabase/functions/_shared/customer-service-learning.ts";
import { isLegacyAutomatedReply } from "../supabase/functions/_shared/customer-service-automated-replies.ts";
import {
  classifyWatiHistoryRole,
  extractWatiConversationIds,
  fetchWatiContactPhones,
  fetchWatiContactRecords,
  fetchWatiConversationEvents,
  fetchWatiConversationMessages,
  fetchWatiConversationMessagesV1,
  isWatiBroadcastMessage,
  mapWithConcurrency,
  mapWatiHistoryMessages,
  normalizeWatiHistoryItem,
  resolveWatiApiBase,
} from "../supabase/functions/_shared/wati-conversation-history.ts";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("wati conversation history adapter", () => {
  it("resolves the tenant API base from the configured endpoint", () => {
    expect(resolveWatiApiBase("https://live-mt-server.wati.io/2552"))
      .toBe("https://live-mt-server.wati.io/2552");
    expect(resolveWatiApiBase("https://live-mt-server.wati.io"))
      .toBe("https://live-mt-server.wati.io/2552");
    expect(resolveWatiApiBase("https://live-mt-server.wati.io/2552/api/v1"))
      .toBe("https://live-mt-server.wati.io/2552");
  });

  it("normalizes v3 and v1 message shapes", () => {
    expect(normalizeWatiHistoryItem({
      id: "m1", text: "你好", type: "text", timestamp: "2026-08-01T10:00:00Z",
      owner: false, local_message_id: "l1", event_type: "message",
    })).toMatchObject({ id: "m1", text: "你好", owner: false, eventType: "message" });
    expect(normalizeWatiHistoryItem({
      id: "m2", messageText: "回覆", messageType: "text", created: "2026-08-01T10:01:00Z",
    })).toMatchObject({ id: "m2", text: "回覆" });
    expect(normalizeWatiHistoryItem({ id: "m3", text: "no timestamp" })).toBeNull();
    expect(normalizeWatiHistoryItem({
      id: "m4", text: "epoch", created: "2026-09-18T14:54:32.831Z", timestamp: "1789743272",
    })).toMatchObject({ id: "m4", occurredAt: "2026-09-18T14:54:32.831Z" });
    expect(normalizeWatiHistoryItem({
      id: "m5", finalText: "廣播訊息", timestamp: "1789743272",
    })).toMatchObject({ id: "m5", text: "廣播訊息", occurredAt: "2026-09-18T14:54:32.000Z" });
    expect(normalizeWatiHistoryItem({
      id: 6, text: "數字", timestamp: 1789743272,
    })).toMatchObject({ id: "6", occurredAt: "2026-09-18T14:54:32.000Z" });
  });

  it("classifies customer, bot, and human operators", () => {
    const base = { id: "m", text: "x", type: "text", occurredAt: "2026-08-01T10:00:00Z",
      owner: false, localMessageId: "", operatorName: "", operatorEmail: "", eventType: "message" };
    expect(classifyWatiHistoryRole(base)).toBe("customer");
    expect(classifyWatiHistoryRole({ ...base, owner: true })).toBe("assistant");
    expect(classifyWatiHistoryRole({ ...base, owner: true, localMessageId: "fcc-bot-1" }))
      .toBe("assistant");
    expect(classifyWatiHistoryRole({ ...base, owner: true, operatorName: "Ada" })).toBe("human");
    expect(classifyWatiHistoryRole({ ...base, owner: true, operatorEmail: "ada@foodchannels-catering.com" }))
      .toBe("human");
    expect(classifyWatiHistoryRole({ ...base, owner: true, operatorName: "bot" })).toBe("assistant");
    expect(classifyWatiHistoryRole({ ...base, eventType: "broadcastMessage" })).toBe("assistant");
    expect(classifyWatiHistoryRole({ ...base, eventType: "templateMessage" })).toBe("assistant");
  });

  it("flags broadcast blasts but not one-to-one templates", () => {
    const rows = mapWatiHistoryMessages([
      { id: "b1", text: "中秋早鳥優惠，滿$2,500即減$200", type: "text", occurredAt: "2026-08-28T04:05:00Z",
        owner: false, localMessageId: "", operatorName: "", operatorEmail: "", eventType: "broadcastMessage" },
      { id: "t1", text: "訂單確認：你的到會套餐將送到", type: "text", occurredAt: "2026-08-28T04:06:00Z",
        owner: false, localMessageId: "", operatorName: "", operatorEmail: "", eventType: "templateMessage" },
    ], { phone: "85291234567", environment: "develop" });

    expect(rows[0]).toMatchObject({ role: "assistant", is_broadcast: true });
    expect(rows[1]).toMatchObject({ role: "assistant", is_broadcast: false });
    expect(isWatiBroadcastMessage({
      id: "b2", text: "x", type: "text", occurredAt: "2026-08-28T04:05:00Z",
      owner: false, localMessageId: "", operatorName: "", operatorEmail: "", eventType: "broadcastMessage",
    })).toBe(true);
    expect(isWatiBroadcastMessage({
      id: "t2", text: "x", type: "text", occurredAt: "2026-08-28T04:06:00Z",
      owner: false, localMessageId: "", operatorName: "", operatorEmail: "", eventType: "templateMessage",
    })).toBe(false);
  });

  it("maps, filters by date, and redacts identity data", () => {
    const rows = mapWatiHistoryMessages([
      { id: "q1", text: "想查單 9123 4567", type: "text", occurredAt: "2026-08-01T10:00:00Z",
        owner: false, localMessageId: "", operatorName: "", operatorEmail: "", eventType: "message" },
      { id: "h1", text: "請提供單號", type: "text", occurredAt: "2026-08-01T10:05:00Z",
        owner: true, localMessageId: "x", operatorName: "Ada", operatorEmail: "", eventType: "message" },
      { id: "old", text: "舊訊息", type: "text", occurredAt: "2026-07-01T10:00:00Z",
        owner: false, localMessageId: "", operatorName: "", operatorEmail: "", eventType: "message" },
    ], { phone: "85291234567", environment: "develop", since: "2026-08-01T00:00:00Z" });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ role: "customer", phone_normalized: "85291234567",
      environment: "develop", created_at: "2026-08-01T10:00:00.000Z" });
    expect(rows[0].message_text).not.toContain("9123 4567");
    expect(rows[1]).toMatchObject({ role: "human", source_message_id: "h1" });
  });

  it("skips the internal develop test number", () => {
    const rows = mapWatiHistoryMessages([
      { id: "t1", text: "測試", type: "text", occurredAt: "2026-08-01T10:00:00Z",
        owner: false, localMessageId: "", operatorName: "", operatorEmail: "", eventType: "message" },
    ], { phone: "8613828747224", environment: "develop" });
    expect(rows).toEqual([]);
  });

  it("paginates v3 messages and falls back to v1 on unavailable endpoints", async () => {
    const calls: string[] = [];
    const v3Fetch = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      calls.push(value);
      if (value.includes("page_number=1")) {
        return jsonResponse({ message_list: [
          { id: "a", text: "1", timestamp: "2026-08-01T10:00:00Z" },
          { id: "b", text: "2", timestamp: "2026-08-01T10:01:00Z" },
        ] });
      }
      return jsonResponse({ message_list: [
        { id: "c", text: "3", timestamp: "2026-08-01T10:02:00Z" },
      ] });
    }) as unknown as typeof fetch;

    const page = await fetchWatiConversationMessages({
      endpoint: "https://live-mt-server.wati.io/2552", token: "t",
      phone: "85291234567", fetchImpl: v3Fetch, pageSize: 2,
    });
    expect(page.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(calls.every((url) => url.includes("/api/ext/v3/conversations/"))).toBe(true);

    const fallbackFetch = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes("/api/ext/v3/")) return new Response("forbidden", { status: 403 });
      return jsonResponse({ result: "success", messages: { items: [
        { id: "v1", text: "遺留訊息", created: "2026-08-01T10:00:00Z" },
      ] } });
    }) as unknown as typeof fetch;
    const fallback = await fetchWatiConversationMessages({
      endpoint: "https://live-mt-server.wati.io/2552", token: "t",
      phone: "85291234567", fetchImpl: fallbackFetch, pageSize: 2,
    });
    expect(fallback.map((item) => item.id)).toEqual(["v1"]);
  });

  it("falls back to the next token when the first is rejected with 401", async () => {
    const authorizations: string[] = [];
    const stub = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const authorization = String(
        (init?.headers as Record<string, string> | undefined)?.Authorization ?? "",
      );
      authorizations.push(authorization);
      if (authorization.includes("bad")) return new Response("", { status: 401 });
      return jsonResponse({ message_list: [
        { id: "m", text: "hi", timestamp: "2026-08-01T10:00:00Z" },
      ] });
    }) as unknown as typeof fetch;

    const rows = await fetchWatiConversationMessages({
      endpoint: "https://live-mt-server.wati.io/2552",
      tokens: ["bad", "good"],
      phone: "85291234567",
      fetchImpl: stub,
      pageSize: 2,
    });

    expect(rows.map((item) => item.id)).toEqual(["m"]);
    expect(authorizations.some((value) => value.includes("bad"))).toBe(true);
    expect(authorizations.some((value) => value.includes("good"))).toBe(true);
  });

  it("falls back to v1 when v3 is unauthorized", async () => {
    const stub = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("/api/ext/v3/")) return new Response("", { status: 401 });
      return jsonResponse({ messages: { items: [
        { id: "v1", text: "舊訊息", created: "2026-08-01T10:00:00Z" },
      ] } });
    }) as unknown as typeof fetch;

    const rows = await fetchWatiConversationMessages({
      endpoint: "https://live-mt-server.wati.io/2552",
      tokens: ["only"],
      phone: "85291234567",
      fetchImpl: stub,
      pageSize: 2,
    });

    expect(rows.map((item) => item.id)).toEqual(["v1"]);
  });

  it("bounds concurrency and preserves result order", async () => {
    let inFlight = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return value * 2;
    });
    expect(peak).toBeLessThanOrEqual(2);
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  it("retries retryable responses before giving up", async () => {
    let calls = 0;
    const stub = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("slow down", { status: 429, headers: { "retry-after": "0" } });
      }
      return jsonResponse({ message_list: [
        { id: "m", text: "hi", timestamp: "2026-08-01T10:00:00Z" },
      ] });
    }) as unknown as typeof fetch;

    const rows = await fetchWatiConversationMessages({
      endpoint: "https://live-mt-server.wati.io/2552",
      token: "t",
      phone: "85291234567",
      fetchImpl: stub,
      pageSize: 2,
      retryDelayMs: 1,
    });

    expect(rows.map((item) => item.id)).toEqual(["m"]);
    expect(calls).toBe(2);
  });

  it("collects conversation ids from the v1 event feed", async () => {
    const stub = vi.fn(async () => jsonResponse({
      result: "success",
      messages: {
        items: [
          { id: "e1", conversationId: "c1", eventType: "ticket", created: "2026-07-01T00:00:00Z" },
          { id: "e2", conversationId: "c1", eventType: "message", created: "2026-07-01T00:01:00Z" },
          { id: "e3", conversationId: "c2", eventType: "ticket", created: "2026-07-02T00:00:00Z" },
        ],
      },
    })) as unknown as typeof fetch;

    const events = await fetchWatiConversationEvents({
      endpoint: "https://live-mt-server.wati.io/2552",
      token: "t",
      phone: "85291234567",
      fetchImpl: stub,
      pageSize: 100,
    });

    expect(events.map((event) => event.conversationId)).toEqual(["c1", "c1", "c2"]);
    expect(extractWatiConversationIds(events)).toEqual(["c1", "c2"]);
  });

  it("stops paginating once the wall-clock deadline is reached", async () => {
    let calls = 0;
    const stub = vi.fn(async () => {
      calls += 1;
      return jsonResponse({ messages: { items: [
        { id: `m${calls}`, text: "x", created: "2026-08-01T10:00:00Z" },
      ] } });
    }) as unknown as typeof fetch;
    const rows = await fetchWatiConversationMessagesV1({
      endpoint: "https://live-mt-server.wati.io/2552", token: "t", phone: "85291234567",
      fetchImpl: stub, pageSize: 1, deadlineAt: Date.now() - 1,
    });
    expect(rows).toEqual([]);
    expect(calls).toBe(0);
  });

  it("enumerates contacts and normalizes phone numbers", async () => {
    const stub = vi.fn(async () => jsonResponse({ contact_list: [
      { phone: "+852 9123 4567" },
      { wa_id: "8613800000000" },
      { phone: "" },
    ] })) as unknown as typeof fetch;
    const phones = await fetchWatiContactPhones({
      endpoint: "https://live-mt-server.wati.io/2552", token: "t", fetchImpl: stub, pageSize: 100,
    });
    expect(phones).toEqual(["85291234567", "8613800000000"]);
  });

  it("reads each contact's last activity so inactive contacts can be skipped", async () => {
    const stub = vi.fn(async () => jsonResponse({ contact_list: [
      { phone: "85291234567", lastUpdated: "2026-09-21T03:54:40.718Z" },
      { phone: "85255111130", lastMessageTime: "2026-08-01T00:00:00.000Z" },
      { phone: "85260000000" },
    ] })) as unknown as typeof fetch;
    const records = await fetchWatiContactRecords({
      endpoint: "https://live-mt-server.wati.io/2552", token: "t", fetchImpl: stub, pageSize: 100,
    });
    expect(records).toEqual([
      { phone: "85291234567", lastMessageAt: "2026-09-21T03:54:40.718Z" },
      { phone: "85255111130", lastMessageAt: "2026-08-01T00:00:00.000Z" },
      { phone: "85260000000", lastMessageAt: "" },
    ]);
  });
});

describe("automated reply detection", () => {
  it("flags canned bot replies even when the sender looks human", () => {
    expect(isLegacyAutomatedReply(
      "唔好意思，我哋呢度只可以幫你查訂單、到會查詢，或者公司已公布嘅政策。如果需要其他協助，請等同事上線。",
    )).toBe(true);
    expect(isLegacyAutomatedReply("已經幫你記低，同事會跟進。唔使再喺 WhatsApp 補電郵。")).toBe(true);
    expect(isLegacyAutomatedReply("你好。未搵到用呢個 WhatsApp 號碼嘅正式訂單。如果你想查到會，請話我知活動日期或者人數，同事會跟進。")).toBe(true);
    expect(isLegacyAutomatedReply("可以早一日前3:00前預訂")).toBe(false);
    expect(isLegacyAutomatedReply("唔該幫我改去星期五")).toBe(false);
  });

  it("classifies an old automated reply from a human-looking sender as assistant", () => {
    const role = classifyWatiHistoryRole({
      id: "m1",
      text: "已經幫你記低，同事會跟進。唔使再喺 WhatsApp 補電郵。",
      type: "text",
      occurredAt: "2026-09-11T03:35:00.000Z",
      owner: true,
      localMessageId: "",
      operatorName: "Yoko FC Catering",
      operatorEmail: "",
      eventType: "message",
    });
    expect(role).toBe("assistant");
  });

  it("treats the WATI API token sender as automated", () => {
    const base = {
      id: "m2", text: "多謝查詢，同事會盡快回覆。", type: "text",
      occurredAt: "2026-09-11T03:40:00.000Z", owner: true,
      localMessageId: "", operatorEmail: "", eventType: "message",
    };
    expect(classifyWatiHistoryRole({ ...base, operatorName: "API Token 2552" })).toBe("assistant");
    expect(classifyWatiHistoryRole({ ...base, operatorName: "Bot" })).toBe("assistant");
    expect(classifyWatiHistoryRole({ ...base, operatorName: "Yoko FC Catering" })).toBe("human");
  });
});

describe("learning message merge", () => {
  it("deduplicates live and imported rows by provider message id and role", () => {
    const merged = mergeLearningMessages(
      [{ id: "live-1", sourceMessageId: "m1", phone: "85290000000", role: "customer",
        text: "問題", createdAt: "2026-08-01T10:00:00Z" }],
      [
        { id: "imp-1", sourceMessageId: "m1", phone: "85290000000", role: "customer",
          text: "問題", createdAt: "2026-08-01T10:00:00Z" },
        { id: "imp-2", sourceMessageId: "m2", phone: "85290000000", role: "human",
          text: "答案", createdAt: "2026-08-01T10:05:00Z" },
      ],
    );
    expect(merged.map((message) => message.id)).toEqual(["live-1", "imp-2"]);
  });
});

describe("learning import wiring", () => {
  it("keeps imported rows out of live bot context", () => {
    const bot = readFileSync("supabase/functions/wati-customer-service/index.ts", "utf8");
    expect(bot).not.toContain("customer_service_learning_import_messages");
  });

  it("reads imported history in the daily learning report", () => {
    const report = readFileSync("supabase/functions/customer-service-daily-report/index.ts", "utf8");
    expect(report).toContain("customer_service_learning_import_messages");
    expect(report).toContain("mergeLearningMessages");
  });

  it("creates the import tables in a service-role-only migration", () => {
    const sql = readFileSync(
      "supabase/migrations/20260919150000_customer_service_learning_import.sql",
      "utf8",
    );
    expect(sql).toContain("customer_service_learning_import_messages");
    expect(sql).toContain("customer_service_learning_import_runs");
    expect(sql).toContain("unique (environment, source_message_id, role)");
    expect(sql).toContain("grant all on table public.customer_service_learning_import_messages to service_role");
  });

  it("filters the internal test number from the import summary", () => {
    const sql = readFileSync(
      "supabase/migrations/20260919170000_customer_service_learning_ignore_test_phone.sql",
      "utf8",
    );
    expect(sql).toContain("delete from public.customer_service_learning_import_messages");
    expect(sql).toContain("where messages.phone_normalized not in ('8613828747224', '13828747224')");
  });

  it("excludes broadcast blasts from the import summary and learning report", () => {
    const sql = readFileSync(
      "supabase/migrations/20260921130000_customer_service_learning_exclude_broadcasts.sql",
      "utf8",
    );
    expect(sql).toContain("add column if not exists is_broadcast");
    expect(sql).toContain("count(*) filter (where not messages.is_broadcast) as message_count");
    expect(sql).toContain("broadcast_count");
    const report = readFileSync(
      "supabase/functions/customer-service-daily-report/index.ts",
      "utf8",
    );
    expect(report).toContain("is_broadcast !== true");
  });

  it("authorizes the backfill function before contacting WATI", () => {
    const source = readFileSync(
      "supabase/functions/wati-customer-service-backfill/index.ts",
      "utf8",
    );
    expect(source).toContain("await authorize(request, admin)");
    expect(source).toContain("fetchWatiConversationMessagesV1");
    expect(source).toContain("customer_service_learning_import_runs");
    expect(source).toContain("isIgnoredCustomerServicePhone");
  });

  it("excludes the internal test number from the daily learning report", () => {
    const report = readFileSync(
      "supabase/functions/customer-service-daily-report/index.ts",
      "utf8",
    );
    expect(report).toContain("isIgnoredCustomerServicePhone");
  });
});
