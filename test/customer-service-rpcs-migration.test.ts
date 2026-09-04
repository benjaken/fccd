import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260904133000_whatsapp_customer_service_rpcs.sql"),
  "utf8",
);

describe("WhatsApp customer-service RPCs", () => {
  it("looks up visible formal orders by normalized phone and hides archives", () => {
    expect(sql).toContain("create or replace function public.customer_service_lookup_orders(p_phone text)");
    expect(sql).toContain("private.self_service_phone(p_phone)");
    expect(sql).toContain("orders.document_type = 'order'");
    expect(sql).toContain("orders.archived_at is null");
    expect(sql).toContain("grant execute on function public.customer_service_lookup_orders(text) to service_role");
    expect(sql).toContain("revoke all on function public.customer_service_lookup_orders(text) from public, anon, authenticated");
    expect(sql).toContain("self_service_search");
  });

  it("writes a WhatsApp quote without converting or touching formal orders", () => {
    expect(sql).toContain("create or replace function public.customer_service_write_inquiry(");
    expect(sql).toContain("'whatsapp'");
    expect(sql).toContain("document_type");
    expect(sql).toContain("'quote'");
    expect(sql).toContain("p_another_event");
    expect(sql).toContain("quote_status, '') not in ('Done Deal', 'Case Closed')");
    expect(sql).toMatch(/insert into public.orders[\s\S]*'quote'[\s\S]*'whatsapp'/);
    expect(sql).toContain("grant execute on function public.customer_service_write_inquiry");
    expect(sql).toContain("revoke all on function public.customer_service_write_inquiry");
  });

  it("lets the service role read the bot switch without changing WATI notification controls", () => {
    expect(sql).toContain("auth.role() is distinct from 'service_role'");
    expect(sql).toContain("grant execute on function public.customer_service_controls_get() to authenticated, service_role");
    expect(sql).toContain("Does not alter wati_notification_controls");
    expect(sql).not.toMatch(/alter table[\s\S]{0,80}wati_notification_controls/i);
  });
});
