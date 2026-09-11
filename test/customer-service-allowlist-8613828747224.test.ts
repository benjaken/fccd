import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260911020000_customer_service_allowlist_8613828747224.sql",
  ),
  "utf8",
);

describe("customer-service allowlist 8613828747224", () => {
  it("restricts overnight auto-reply to the pilot WhatsApp number", () => {
    expect(migration).toContain("bot_enabled = true");
    expect(migration).toContain("array['8613828747224']::text[]");
    expect(migration).toContain("auto_reply_start = '19:00'");
    expect(migration).toContain("auto_reply_end = '09:00'");
    expect(migration).toContain("auto_reply_timezone = 'Asia/Hong_Kong'");
    expect(migration).toContain(
      "customer_service_allowlist_8613828747224_not_applied",
    );
  });
});
