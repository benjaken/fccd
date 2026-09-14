import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260914160000_customer_service_all_day_weekends.sql",
  ),
  "utf8",
);

describe("customer-service all-day weekend schedule migration", () => {
  it("keeps weekday overnight service and makes Saturday and Sunday all day", () => {
    expect(migration).toContain("weekday_auto_reply_start = '19:00'");
    expect(migration).toContain("weekday_auto_reply_end = '09:00'");
    expect(migration).toContain("saturday_auto_reply_start = '00:00'");
    expect(migration).toContain("saturday_auto_reply_end = '00:00'");
    expect(migration).toContain("sunday_auto_reply_start = '00:00'");
    expect(migration).toContain("sunday_auto_reply_end = '00:00'");
    expect(migration).toContain("auto_reply_timezone = 'Asia/Hong_Kong'");
  });

  it("changes new Saturday and Sunday defaults to all day", () => {
    expect(migration).toContain(
      "alter column saturday_auto_reply_start set default '00:00'",
    );
    expect(migration).toContain(
      "alter column sunday_auto_reply_end set default '00:00'",
    );
  });
});
