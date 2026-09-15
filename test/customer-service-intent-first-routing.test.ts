import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260915115500_customer_service_intent_first_mutation_gate.sql",
  ),
  "utf8",
);
const followUpMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260915130700_customer_service_availability_followup_context.sql",
  ),
  "utf8",
);

describe("customer-service intent-first routing migration", () => {
  it("adds a dedicated read-only delivery-availability intent", () => {
    expect(migration).toContain("'delivery_availability'");
    expect(migration).toContain("'availability_check'");
    expect(migration).toContain("'check_order_intake'");
    expect(migration).toContain("九月26號預訂到會可以嗎");
  });

  it("documents that collected fields are not write authorization", () => {
    expect(migration).toContain(
      "單獨提供日期／人數只代表資料，不代表授權寫入",
    );
    expect(migration).toContain("確認後先交俾客服跟進");
  });

  it("keeps time-only replies in the read-only availability workflow", () => {
    expect(followUpMigration).toContain("currentTask 以 availability: 開頭");
    expect(followUpMigration).toContain("不可改成 FAQ 搜尋或到會寫入");
    expect(followUpMigration).toContain("19點差不多");
    expect(followUpMigration).toContain("never authorizes inquiry writes");
  });
});
