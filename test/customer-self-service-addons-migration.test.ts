import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260828130000_customer_self_service_addons.sql"),
  "utf8",
);
const shopifyWorkflowSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260828147000_addon_shopify_workflow.sql"),
  "utf8",
);

describe("customer self-service add-ons migration", () => {
  it("keeps settings, checkout state, and historical order lines linked", () => {
    expect(sql).toContain("create table public.self_service_addon_products");
    expect(sql).toContain("create table public.self_service_addon_block_dates");
    expect(sql).toContain("create table public.customer_self_service_addon_checkouts");
    expect(sql).toContain("addon_checkout_id uuid");
    expect(sql).toContain("is_addon, addon_checkout_id");
  });

  it("calculates the cutoff as 3pm Hong Kong time on the prior delivery day", () => {
    expect(sql).toContain("time zone 'Asia/Hong_Kong'");
    expect(sql).toContain("::date - 1) + time '15:00'");
    expect(sql).toContain("if now() >= v_cutoff then return 'cutoff_passed'");
  });

  it("checks block dates before allowing an add-on checkout", () => {
    expect(sql).toContain("return 'block_date'");
    expect(sql).toContain("private.self_service_addon_unavailable_reason(v_order)");
    expect(sql).toContain("begin_customer_self_service_addon_capture");
    expect(sql).toContain("status = 'capture_pending'");
  });

  it("does not grant anonymous users direct access to payment tables", () => {
    expect(sql).toMatch(/revoke all on table[\s\S]*customer_self_service_addon_checkouts[\s\S]*from public, anon, authenticated/);
    expect(sql).toContain("grant execute on function public.customer_self_service_prepare_addon_checkout(uuid, uuid, jsonb) to anon, authenticated");
    expect(sql).toContain("grant execute on function public.complete_customer_self_service_addon_checkout(uuid, text, text, numeric, text, timestamptz) to service_role");
  });

  it("finalizes add-on lines and PayPal payment in one database transaction", () => {
    expect(sql).toContain("p_paypal_capture_id text");
    expect(sql).toContain("'self-service-paypal-' || v_payment_id");
    expect(sql).toContain("perform private.recalculate_quote_total(v_order.id)");
    expect(sql).toContain("set status = 'completed', paypal_capture_id = p_paypal_capture_id");
  });

  it("tracks paid AO orders until staff confirms Shopify input", () => {
    expect(shopifyWorkflowSql).toContain("addon_shopify_pending boolean not null default false");
    expect(shopifyWorkflowSql).toContain("mark_addon_shopify_pending");
    expect(shopifyWorkflowSql).toContain("new.addon_checkout_id is not null");
    expect(shopifyWorkflowSql).toContain("confirm_order_addon_shopify_input");
    expect(shopifyWorkflowSql).toContain("addon_shopify_pending = false");
  });

  it("exposes the block-date lookup only to authenticated staff", () => {
    expect(shopifyWorkflowSql).toContain("is_self_service_addon_block_date");
    expect(shopifyWorkflowSql).toContain("revoke all on function public.is_self_service_addon_block_date(date) from public, anon");
    expect(shopifyWorkflowSql).toContain("grant execute on function public.is_self_service_addon_block_date(date) to authenticated");
  });
});

