import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260914094000_remove_customer_service_email_prompt.sql",
  ),
  "utf8",
);

describe("customer-service email prompt removal", () => {
  it("removes every saved copy from the configured collect-done reply", () => {
    expect(migration).toContain("where template_key = 'collect_done'");
    expect(migration).toContain(
      "replace(content, '唔使再喺 WhatsApp 補電郵。', '')",
    );
  });
});
