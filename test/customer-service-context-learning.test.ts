import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { sanitizeCustomerServiceContextText } from "../supabase/functions/_shared/customer-service-context.ts";
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
