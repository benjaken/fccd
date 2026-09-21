import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
const rpcMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: invokeMock },
    rpc: rpcMock,
  },
}));

import {
  fetchCustomerServiceLearningImportSummary,
  importCustomerServiceHistory,
} from "@/lib/customer-faq";

describe("customer-service history import client", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    rpcMock.mockReset();
  });

  it("follows next_cursor until the backfill reports done", async () => {
    invokeMock
      .mockResolvedValueOnce({
        data: {
          ok: true,
          done: false,
          messages_imported: 10,
          phones_processed: 5,
          next_cursor: { phone_index: 5, phones: ["85290000001"] },
          errors: [],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          done: true,
          messages_imported: 4,
          phones_processed: 8,
          next_cursor: null,
          errors: ["85290000000:boom"],
        },
        error: null,
      });

    const progress: number[] = [];
    const result = await importCustomerServiceHistory({
      since: "2026-08-01T00:00:00+08:00",
      onProgress: (item) => progress.push(item.messagesImported),
    });

    expect(result).toMatchObject({ batches: 2, messagesImported: 14, phonesProcessed: 8 });
    expect(result.errors).toEqual(["85290000000:boom"]);
    expect(progress).toEqual([10, 14]);
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock.mock.calls[0][0]).toBe("wati-customer-service-backfill");
    expect(invokeMock.mock.calls[0][1].body).toMatchObject({
      since: "2026-08-01T00:00:00+08:00",
    });
    expect(invokeMock.mock.calls[1][1].body).toMatchObject({
      cursor: { phone_index: 5, phones: ["85290000001"] },
    });
  });

  it("rejects an invalid backfill response instead of silently stopping", async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: false }, error: null });
    await expect(importCustomerServiceHistory()).rejects.toThrow(
      "customer_service_import_invalid_response",
    );
  });

  it("surfaces the server error code instead of a generic failure", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: new Response(JSON.stringify({ error: "wati_credentials_missing" }), { status: 500 }),
      },
    });
    await expect(importCustomerServiceHistory()).rejects.toThrow("wati_credentials_missing");
  });

  it("reports a gateway timeout as http_504", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: "non-2xx", context: new Response("", { status: 504 }) },
    });
    await expect(importCustomerServiceHistory()).rejects.toThrow("http_504");
  });

  it("bounds each call so the function returns before the platform timeout", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, done: true, messages_imported: 0, phones_processed: 0,
        next_cursor: null, errors: [] },
      error: null,
    });
    await importCustomerServiceHistory({ activeOnly: true, refreshContacts: true });
    expect(invokeMock.mock.calls[0][1].body).toMatchObject({
      max_runtime_ms: 110_000,
      concurrency: 16,
      active_only: true,
      refresh_contacts: true,
    });
  });

  it("continues past an enumeration-only first response", async () => {
    invokeMock
      .mockResolvedValueOnce({
        data: { ok: true, done: false, phones_requested: 100, phones_processed: 0,
          messages_imported: 0, next_cursor: { phone_index: 0, phones: ["85290000001"] }, errors: [] },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: true, done: true, phones_requested: 100, phones_processed: 1,
          messages_imported: 3, next_cursor: null, errors: [] },
        error: null,
      });

    const result = await importCustomerServiceHistory();

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(result.messagesImported).toBe(3);
    expect(invokeMock.mock.calls[1][1].body).toMatchObject({
      cursor: { phone_index: 0, phones: ["85290000001"] },
    });
  });

  it("maps import summary rows", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          import_date: "2026-08-01",
          message_count: 12,
          human_count: 3,
          customer_count: 9,
          broadcast_count: 2855,
        },
      ],
      error: null,
    });
    await expect(fetchCustomerServiceLearningImportSummary()).resolves.toEqual([
      { date: "2026-08-01", messageCount: 12, humanCount: 3, customerCount: 9, broadcastCount: 2855 },
    ]);
    expect(rpcMock).toHaveBeenCalledWith(
      "customer_service_learning_import_summary",
      { p_limit: 90 },
    );
  });
});

describe("history import UI wiring", () => {
  it("renders the import controls and per-day learning buttons", () => {
    const page = readFileSync(
      "src/components/settings/CustomerFaqPage.tsx",
      "utf8",
    );
    expect(page).toContain("歷史對話學習");
    expect(page).toContain("importCustomerServiceHistory");
    expect(page).toContain("fetchCustomerServiceLearningImportSummary");
    expect(page).toContain("一鍵學習最近日期");
    expect(page).toContain("產生學習建議");
    expect(page).toContain("setImportDialogOpen(true)");
    expect(page).toContain("getTime() + 86_400_000");
    expect(page).toContain("CUSTOMER_SERVICE_IMPORT_MAX_RANGE_DAYS = 31");
    expect(page).toContain("最多 31 天");
    expect(page).toContain("最近 30 日");
    expect(page).toContain("historyImportRangeDays");
  });

  it("gates the import summary RPC behind customer FAQ page access", () => {
    const sql = readFileSync(
      "supabase/migrations/20260919160000_customer_service_learning_import_summary.sql",
      "utf8",
    );
    expect(sql).toContain("customer_service_learning_import_summary");
    expect(sql).toContain("private.has_page_access('settings.customer_faq')");
  });
});
