import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260909010000_enable_customer_service_overnight_auto_reply.sql",
  ),
  "utf8",
);

describe("customer-service overnight auto reply", () => {
  it("enables the bot from 19:00 until 09:00 Hong Kong time", () => {
    expect(migration).toContain("bot_enabled = true");
    expect(migration).toContain("auto_reply_start = '19:00'");
    expect(migration).toContain("auto_reply_end = '09:00'");
    expect(migration).toContain("auto_reply_timezone = 'Asia/Hong_Kong'");
  });

  it("removes the pilot recipient restriction", () => {
    expect(migration).toContain("allowed_phones = '{}'::text[]");
    expect(migration).toContain("cardinality(allowed_phones) = 0");
  });
});
