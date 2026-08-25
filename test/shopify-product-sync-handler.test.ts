import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const handler = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/functions/shopify-product-sync/index.ts"),
  "utf8",
);
const sync = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/functions/shopify-product-sync/sync.ts"),
  "utf8",
);

describe("Shopify product sync handler contract", () => {
  it("requires product topic allowlisting, raw-body HMAC, delivery IDs, and durable enqueue", () => {
    expect(handler).toContain('"products/create"');
    expect(handler).toContain('"products/update"');
    expect(handler).toContain('"products/delete"');
    expect(handler).toContain("const rawBody = await request.text()");
    expect(handler).toContain('request.headers.get("X-Shopify-Hmac-Sha256")');
    expect(handler).toContain('request.headers.get("X-Shopify-Webhook-Id")');
    expect(handler).toContain('.from("shopify_catalog_webhook_events")');
    expect(handler).toContain("ignoreDuplicates: true");
    expect(handler).toContain("return jsonResponse({ ok: true, accepted: true, webhookId }, 202)");
  });

  it("supports every requested manual mode without writing the formal catalog", () => {
    for (const mode of ["full", "incremental", "specific_product", "retry_failed"]) {
      expect(handler).toContain(`"${mode}"`);
    }
    expect(sync).toContain('.from("shopify_catalog_drafts")');
    expect(sync).not.toContain('.from("packages").insert');
    expect(sync).not.toContain('.from("products").insert');
    expect(sync).toContain("last_successful_synced_at");
    expect(sync).toContain("10 * 60 * 1000");
  });
});
