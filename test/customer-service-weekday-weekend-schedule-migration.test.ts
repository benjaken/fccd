import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260914093000_customer_service_weekday_weekend_schedule.sql",
  ),
  "utf8",
);

describe("customer-service weekday and weekend schedule migration", () => {
  it("adds separate weekday and weekend windows without removing legacy columns", () => {
    expect(migration).toContain("weekday_auto_reply_start");
    expect(migration).toContain("weekday_auto_reply_end");
    expect(migration).toContain("weekend_auto_reply_start");
    expect(migration).toContain("weekend_auto_reply_end");
    expect(migration).not.toContain("drop column auto_reply_start");
    expect(migration).not.toContain("drop column auto_reply_end");
  });

  it("keeps the legacy setter and adds an explicit four-window setter", () => {
    expect(migration).toContain(
      "customer_service_controls_set(boolean, time, time)",
    );
    expect(migration).toContain(
      "customer_service_controls_set(boolean, time, time, time, time)",
    );
    expect(migration).toContain("p_weekday_auto_reply_start");
    expect(migration).toContain("p_weekend_auto_reply_start");
  });

  it("initializes both new windows from the current live schedule", () => {
    expect(migration).toContain(
      "weekday_auto_reply_start = controls.auto_reply_start",
    );
    expect(migration).toContain(
      "weekend_auto_reply_start = controls.auto_reply_start",
    );
  });
});
