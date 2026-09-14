import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260914123000_disable_shopify_new_order_wati.sql",
  ),
  "utf8",
);
const worker = readFileSync(
  resolve(process.cwd(), "supabase/functions/wati-order-notifications/index.ts"),
  "utf8",
);
const internalTemplates = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/wati-internal-template-config.ts"),
  "utf8",
);
const documentation = readFileSync(
  resolve(process.cwd(), "docs/WATI_ORDER_NOTIFICATIONS.md"),
  "utf8",
);

describe("disabled Shopify new-order WATI", () => {
  it("removes the enqueue trigger and cancels unfinished Shopify notification jobs", () => {
    expect(migration).toContain(
      "drop trigger if exists enqueue_shopify_imported_order_wati on public.orders",
    );
    expect(migration).toContain(
      "drop function if exists private.enqueue_shopify_imported_order_wati()",
    );
    expect(migration).toContain("event_key = 'shopify_order_imported'");
    expect(migration).toContain("channel = 'whatsapp'");
    expect(migration).toContain("status in ('pending', 'processing', 'failed')");
    expect(migration).toContain("last_error = 'shopify_new_order_wati_disabled'");
  });

  it("keeps stale queue entries fail-closed and removes the retired template config", () => {
    expect(worker).toContain('job.event_key === "shopify_order_imported"');
    expect(worker).toContain('last_error: "shopify_new_order_wati_disabled"');
    expect(worker).not.toContain('internalWatiTemplate("shopifyNewOrder")');
    expect(internalTemplates).not.toContain("shopifyNewOrder");
    expect(internalTemplates).not.toContain("WATI_SHOPIFY_NEW_ORDER_TEMPLATE_NAME");
  });

  it("documents the current WATI and email notification matrix", () => {
    expect(documentation).toContain("## Current notification matrix");
    expect(documentation).toContain("Shopify new order");
    expect(documentation).toContain("Disabled");
    expect(documentation).toContain("Manual order confirmation");
    expect(documentation).toContain("Same-day delivery reminder");
    expect(documentation).toContain("Factory-unsent reminder");
    expect(documentation).toContain("Order reconciliation");
  });
});
