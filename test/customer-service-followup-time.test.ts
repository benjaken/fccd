import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260914095000_customer_service_followup_time.sql",
  ),
  "utf8",
);

describe("customer-service follow-up time", () => {
  it("states when staff will follow up in the configured reply", () => {
    expect(migration).toContain(
      "已經幫你記低，客服會喺下一個工作日上午 9 點後跟進。",
    );
    expect(migration).toContain("where template_key = 'collect_done'");
  });
});
