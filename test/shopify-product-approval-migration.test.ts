import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/migrations/20260825080000_shopify_product_approval_sync.sql"),
  "utf8",
);
const materialSql = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/migrations/20260825173000_shopify_approval_material_mappings.sql"),
  "utf8",
);

describe("Shopify catalog approval migration", () => {
  it("creates durable webhook dedupe, sync evidence, drafts, children, and mappings", () => {
    expect(sql).toContain("unique (store_id, webhook_id)");
    expect(sql).toContain("create table public.shopify_catalog_sync_runs");
    expect(sql).toContain("create table public.shopify_catalog_sync_errors");
    expect(sql).toContain("create table public.shopify_catalog_draft_variants");
    expect(sql).toContain("create table public.shopify_catalog_draft_choice_sets");
    expect(sql).toContain("create table public.shopify_catalog_draft_package_items");
    expect(sql).toContain("create table public.shopify_catalog_mappings");
  });

  it("protects the queue and formal writes behind the page permission and approval RPC", () => {
    expect(sql).toContain("products.shopify_pending");
    expect(sql).toContain("private.has_page_access('products.shopify_pending')");
    expect(sql).toContain("private.has_page_manage('products.shopify_pending')");
    expect(sql).toContain("create or replace function public.approve_shopify_pending_catalog_item");
    expect(sql).toContain("for update;");
    expect(sql).toContain("shopify_catalog_package_dependencies_incomplete");
    expect(sql).toContain("shopify_catalog_draft_changed");
    expect(sql).toContain("create or replace function public.resolve_shopify_catalog_match");
    expect(sql).toContain("create or replace function public.reject_shopify_pending_catalog_item");
    expect(sql).toContain("shopify_catalog_match_product_invalid");
  });

  it("schedules exactly one daily incremental reconciliation", () => {
    expect(sql).toContain("fccd-shopify-catalog-daily-reconciliation");
    expect(sql).toContain("'0 19 * * *'");
    expect(sql).toContain("\"mode\":\"incremental\"");
    expect(sql.match(/select cron\.schedule\(/g)).toHaveLength(1);
  });

  it("adds selected ingredients and packaging atomically during approval", () => {
    expect(materialSql).toContain("approve_shopify_pending_catalog_item_with_materials");
    expect(materialSql).toContain("public.approve_shopify_pending_catalog_item(");
    expect(materialSql).toContain("jsonb_to_recordset");
    expect(materialSql).toContain("v_ingredient.ingredient_type = '包裝用品'");
    expect(materialSql).toContain("insert into public.product_ingredients");
    expect(materialSql).toContain("mapping.resource_type = 'product_variant'");
    expect(materialSql).toContain("mapping.resource_type = 'package'");
    expect(materialSql).toContain("private.has_page_access('products.shopify_pending')");
  });
});
