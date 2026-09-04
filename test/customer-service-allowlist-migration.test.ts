import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260904140000_whatsapp_customer_service_phone_allowlist.sql"),
  "utf8",
);

describe("WhatsApp customer-service phone allowlist", () => {
  it("adds allowed_phones without touching WATI notification controls", () => {
    expect(sql).toContain("add column if not exists allowed_phones text[]");
    expect(sql).toContain("allowed_phones text[]");
    expect(sql).toContain("auth.role() is distinct from 'service_role'");
    expect(sql).toContain("Does not alter wati_notification_controls");
    expect(sql).not.toMatch(/alter table[\s\S]{0,80}wati_notification_controls/i);
    expect(sql).not.toContain("8613828747224");
  });
});
