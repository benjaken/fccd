import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260914111000_customer_service_saturday_sunday_schedule.sql",
  ),
  "utf8",
);

describe("customer-service Saturday and Sunday schedule migration", () => {
  it("adds independent Saturday and Sunday windows", () => {
    expect(migration).toContain("saturday_auto_reply_start");
    expect(migration).toContain("saturday_auto_reply_end");
    expect(migration).toContain("sunday_auto_reply_start");
    expect(migration).toContain("sunday_auto_reply_end");
  });

  it("initializes both days from the existing weekend schedule", () => {
    expect(migration).toContain(
      "saturday_auto_reply_start = controls.weekend_auto_reply_start",
    );
    expect(migration).toContain(
      "sunday_auto_reply_start = controls.weekend_auto_reply_start",
    );
  });

  it("keeps old setters and adds a three-group setter", () => {
    expect(migration).toContain(
      "customer_service_controls_set(boolean, time, time)",
    );
    expect(migration).toContain(
      "customer_service_controls_set(boolean, time, time, time, time)",
    );
    expect(migration).toContain(
      "customer_service_controls_set(boolean, time, time, time, time, time, time)",
    );
    expect(migration).toContain("p_saturday_auto_reply_start");
    expect(migration).toContain("p_sunday_auto_reply_start");
  });
});
