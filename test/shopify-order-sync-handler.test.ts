import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/functions/shopify-order-sync/index.ts"),
  "utf8",
);

describe("Shopify order webhook handling", () => {
  it("registers create, update, and delete topics", () => {
    expect(source).toContain('"orders/create"');
    expect(source).toContain('"orders/updated"');
    expect(source).toContain('"orders/delete"');
    expect(source).toContain('body.mode === "register_webhooks"');
  });

  it("refreshes Shopify-owned lines on update and archives on delete", () => {
    expect(source).toContain('refreshShopifyLines: topic === "orders/updated"');
    expect(source).toContain("updated_lines_replace_failed");
    expect(source).toContain("archiveDeletedShopifyOrder");
    expect(source).toContain("deleted_order_archive_failed");
  });
});
