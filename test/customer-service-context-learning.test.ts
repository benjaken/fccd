import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  customerServiceContextMessageRow,
  customerServiceContextSince,
  sanitizeCustomerServiceContextText,
  sanitizeCustomerServiceRecentMessages,
} from "../supabase/functions/_shared/customer-service-context.ts";
import { CUSTOMER_SERVICE_PILOT_CASES } from "./fixtures/customer-service-pilot-cases.ts";

describe("customer-service contextual learning", () => {
  it("redacts identity data while retaining order references", () => {
    const value = sanitizeCustomerServiceContextText(
      "訂單 B-1555，電話 9123 4567，電郵 nero@example.com，地址：九龍城某道18號",
    );
    expect(value).toContain("B-1555");
    expect(value).not.toContain("9123 4567");
    expect(value).not.toContain("nero@example.com");
    expect(value).not.toContain("九龍城某道18號");
  });

  it("builds a sanitized human message row for later bot context", () => {
    expect(customerServiceContextMessageRow({
      sourceMessageId: "wati-human-1",
      phone: "85291234567",
      role: "human",
      text: "同事回覆：中秋6-8套餐，客人電話 9123 4567",
      environment: "develop",
    })).toMatchObject({
      source_message_id: "wati-human-1",
      phone_normalized: "85291234567",
      role: "human",
      message_text: "同事回覆：中秋6-8套餐，客人電話 [電話已隱藏]",
      environment: "develop",
    });
  });

  it("keeps the full sanitized 30-day conversation instead of the last eight messages", () => {
    const messages = Array.from({ length: 20 }, (_, index) => ({
      role: index % 3 === 0 ? "human" as const : "customer" as const,
      text: `訊息 ${index + 1}`,
      occurredAt: `2026-09-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
    }));

    expect(sanitizeCustomerServiceRecentMessages(messages)).toHaveLength(20);
    expect(customerServiceContextSince(new Date("2026-09-14T10:00:00.000Z")))
      .toBe("2026-08-15T10:00:00.000Z");
  });

  it("loads one month of context in chronological order", () => {
    const source = readFileSync(
      "supabase/functions/wati-customer-service/index.ts",
      "utf8",
    );

    expect(source).toContain('.gte("created_at", since)');
    expect(source).toContain('.order("created_at", { ascending: true })');
    expect(source).not.toContain("recentMessages.slice(-(activePolicy?.contextWindow ?? 8))");
  });

  it("creates workflow policies, contextual messages, and reviewed test cases", () => {
    const sql = readFileSync(
      "supabase/migrations/20260904210000_customer_service_context_and_learning.sql",
      "utf8",
    );
    expect(sql).toContain("customer_service_messages");
    expect(sql).toContain("customer_service_workflow_policies");
    expect(sql).toContain("customer_service_test_cases");
    expect(sql).toContain("customer_service_feedback_sync_test_case_trigger");
  });

  it("keeps a 50-case multi-turn pilot evaluation set", () => {
    expect(CUSTOMER_SERVICE_PILOT_CASES).toHaveLength(50);
    expect(new Set(CUSTOMER_SERVICE_PILOT_CASES.map((item) => item.expectedDialogAction))).toEqual(
      new Set(["new_request", "cancel_current", "correct_previous", "switch_task"]),
    );
    expect(CUSTOMER_SERVICE_PILOT_CASES.filter((item) => item.messages.length > 1)).toHaveLength(30);
  });
});
