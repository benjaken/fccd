import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260914161000_customer_service_handoff_context.sql",
  ),
  "utf8",
);

describe("customer-service handoff context migration", () => {
  it("stores an explicit handoff kind, urgency, and written quote id", () => {
    expect(migration).toContain("add column if not exists handoff_kind text");
    expect(migration).toContain("add column if not exists handoff_urgent boolean");
    expect(migration).toContain("add column if not exists handoff_quote_id uuid");
    expect(migration).toContain("'same_day_catering'");
    expect(migration).toContain("'order_change'");
    expect(migration).toContain("Never infer urgency from selected_order_id");
  });

  it("updates the greeting to the approved intent question", () => {
    expect(migration).toContain(
      "你好，請問是查詢現有訂單，還是需要到會訂餐協助？",
    );
  });
});
