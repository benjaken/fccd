import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260901190000_manual_notifications_after_quote_conversion.sql"),
  "utf8",
);

describe("manual notifications after quote conversion", () => {
  it("does not enqueue automatic creation notifications for converted orders", () => {
    expect(migration).toMatch(/capture_wati_order_events_on_insert[\s\S]*when \(new\.source_quote_id is null\)/i);
    expect(migration).toMatch(/enqueue_internal_order_notifications_on_insert[\s\S]*when \(new\.source_quote_id is null\)/i);
  });

  it("keeps later order lifecycle triggers and skips only unsent conversion jobs", () => {
    expect(migration).toContain("capture_wati_order_events_on_update");
    expect(migration).toContain("enqueue_internal_order_notifications_on_update");
    expect(migration).toContain("manual_confirmation_required");
    expect(migration).toMatch(/orders\.source_quote_id is not null/i);
    expect(migration).toMatch(/outbox\.sent_at is null/i);
  });

  it("does not disable the separate manual WATI and email confirmation", () => {
    expect(migration).not.toContain("manual_order_confirmation_enabled");
    expect(migration).not.toContain("manual_order_confirmation_email_enabled");
  });
});
