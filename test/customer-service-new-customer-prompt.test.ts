import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260914100000_customer_service_new_customer_catering_prompt.sql",
  ),
  "utf8",
);

describe("customer-service new-customer catering prompt", () => {
  it("does not describe a missing order as an error", () => {
    expect(migration).toContain("where template_key = 'collect_prompt'");
    expect(migration).toContain("活動日期、人數");
    expect(migration).not.toContain("未搵到用呢個 WhatsApp 號碼");
  });
});
