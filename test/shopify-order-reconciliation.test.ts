import { readFileSync } from "node:fs";
import { resolveOperationalOrderMatch } from "../supabase/functions/shopify-order-sync/map.ts";
import { describe, expect, it } from "vitest";

describe("Shopify and Bubble order reconciliation", () => {
  it("chooses the later operational B-1546 record over the Shopify shadow", () => {
    const result = resolveOperationalOrderMatch({
      currentOrderId: "65a6f12a-2974-4f06-92c1-2106cdd3fd0d",
      orderNumber: "B-1546",
      channelId: "channel-hk-lunch-box",
      candidates: [
        {
          id: "65a6f12a-2974-4f06-92c1-2106cdd3fd0d",
          order_number: "B-1546",
          channel_id: "channel-hk-lunch-box",
          source_system: "shopify",
          shopify_order_id: 7868459024657,
        },
        {
          id: "778be1dc-8ebb-495d-823d-f8a404527493",
          order_number: "B-1546",
          channel_id: "channel-hk-lunch-box",
          source_system: "bubble",
          shopify_order_id: null,
        },
      ],
    });

    expect(result).toEqual({
      status: "unique",
      orderId: "778be1dc-8ebb-495d-823d-f8a404527493",
    });
  });

  it("refuses to auto-merge an ambiguous order number", () => {
    const result = resolveOperationalOrderMatch({
      currentOrderId: "shopify-shadow",
      orderNumber: "B-1546",
      channelId: "channel-hk-lunch-box",
      candidates: [
        {
          id: "bubble-a",
          order_number: "B-1546",
          channel_id: "channel-hk-lunch-box",
          source_system: "bubble",
          shopify_order_id: null,
        },
        {
          id: "bubble-b",
          order_number: "B1546",
          channel_id: "channel-hk-lunch-box",
          source_system: "bubble",
          shopify_order_id: null,
        },
      ],
    });

    expect(result).toEqual({ status: "ambiguous" });
  });

  it("keeps a merge alias and reconciles payments transactionally", () => {
    const migration = readFileSync(
      "supabase/migrations/20260823233000_reconcile_shopify_order_shadows.sql",
      "utf8",
    );

    expect(migration).toContain("merged_into_order_id");
    expect(migration).toContain("reconcile_shopify_order_shadow");
    expect(migration).toContain("update public.payments");
    expect(migration).toContain("65a6f12a-2974-4f06-92c1-2106cdd3fd0d");
    expect(migration).toContain("778be1dc-8ebb-495d-823d-f8a404527493");
  });
});
