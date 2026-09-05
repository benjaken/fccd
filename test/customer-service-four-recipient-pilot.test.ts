import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260905023000_customer_service_four_recipient_pilot.sql",
  ),
  "utf8",
);

describe("customer-service four-recipient production pilot", () => {
  it("copies the current first-notification audience into the all-day pilot", () => {
    expect(migration).toContain("order_first_notification_recipients");
    expect(migration).toContain("cardinality(v_allowed_phones), 0) <> 4");
    expect(migration).toContain("allowed_phones = v_allowed_phones");
    expect(migration).toContain("auto_reply_start = '00:00'");
    expect(migration).toContain("auto_reply_end = '00:00'");
    expect(migration).toContain("bot_enabled = true");
  });
});
