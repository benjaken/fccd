import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("order-intake rule editor migration", () => {
  it("updates a rule and its channel exceptions in one permission-checked transaction", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260915141000_update_order_intake_rule.sql"),
      "utf8",
    );

    expect(sql).toContain("create or replace function public.update_order_intake_rule");
    expect(sql).toContain("private.has_page_manage('orders.settings.addon_block_dates')");
    expect(sql).toContain("delete from public.order_intake_rule_channels");
    expect(sql).toContain("insert into public.order_intake_rule_channels");
    expect(sql).toContain("allowed_channel_required");
    expect(sql).toContain("grant execute on function public.update_order_intake_rule");
  });

  it("creates a rule and its channels in one transaction-backed RPC", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260915165000_create_order_intake_rule.sql"),
      "utf8",
    );
    expect(sql).toContain("create or replace function public.create_order_intake_rule");
    expect(sql).toContain("insert into public.order_intake_rules");
    expect(sql).toContain("insert into public.order_intake_rule_channels");
    expect(sql).toContain("grant execute on function public.create_order_intake_rule");
  });
});
