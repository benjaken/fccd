import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canAdvanceCheckpoint,
  canonicalJson,
  partitionConflicts,
  sha256Hex,
} from "../supabase/functions/bubble-daily-incremental/helpers.ts";
import { phoneText, coreMappings } from "../supabase/functions/bubble-daily-incremental/mappings.ts";
import {
  changedOverwriteFields,
  mergeOverwriteRow,
  normalizeOrderNumber,
} from "../supabase/functions/bubble-daily-incremental/overwrite.ts";
import {
  fallbackDeliveryLegacyId,
  orderMetadataFromRecord,
} from "../supabase/functions/bubble-daily-incremental/order-metadata.ts";

describe("bubble daily incremental helpers", () => {
  it("canonicalizes object keys recursively and hashes deterministically", async () => {
    const first = { b: 2, a: 1, nested: { z: true, a: null } };
    const second = { nested: { a: null, z: true }, a: 1, b: 2 };

    expect(canonicalJson(first)).toBe(
      '{"a":1,"b":2,"nested":{"a":null,"z":true}}',
    );
    expect(canonicalJson(second)).toBe(canonicalJson(first));
    expect(await sha256Hex('{"a":1,"b":2}')).toBe(
      "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
    );
    expect(await sha256Hex(canonicalJson(first))).toBe(
      await sha256Hex(canonicalJson(second)),
    );
  });

  it("partitions existing legacy IDs without changing record order", () => {
    const records = [
      { _id: "new-1" },
      { _id: "existing-1" },
      { _id: "new-2" },
      { _id: "existing-2" },
    ];

    const result = partitionConflicts(
      records,
      new Set(["existing-1", "existing-2"]),
    );

    expect(result.fresh.map((record) => record._id)).toEqual([
      "new-1",
      "new-2",
    ]);
    expect(result.conflicts.map((record) => record._id)).toEqual([
      "existing-1",
      "existing-2",
    ]);
  });

  it("advances a checkpoint only after complete successful work", () => {
    expect(canAdvanceCheckpoint(true, false, false)).toBe(true);
    expect(canAdvanceCheckpoint(false, false, false)).toBe(false);
    expect(canAdvanceCheckpoint(true, true, false)).toBe(false);
    expect(canAdvanceCheckpoint(true, false, true)).toBe(false);
  });

  it("keeps numeric Bubble contact numbers as text", () => {
    expect(phoneText(90154004)).toBe("90154004");
    expect(phoneText(" 91234567 ")).toBe("91234567");
    expect(phoneText(null)).toBeNull();
    expect(phoneText("")).toBeNull();
  });

  it("keeps Bubble delivery time windows as text", () => {
    expect(phoneText("18:00 - 19:00")).toBe("18:00 - 19:00");
    expect(phoneText(" 12:00 - 12:30 ")).toBe("12:00 - 12:30");
  });

  it("maps and backfills fleet bank accounts from Bubble payment text", () => {
    const mapping = coreMappings.find(
      (item) => item.sourceType === "ds_super_motorcade",
    );
    expect(mapping).toBeTruthy();
    expect(mapping!.map({
      _id: "fleet-1",
      "Full Name": "Sun-Line Logistics",
      "payment method(text)": "  渣打 40711305668  ",
    }).bank_account).toBe("渣打 40711305668");

    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase/functions/bubble-daily-incremental/index.ts",
      ),
      "utf8",
    );
    expect(source).toContain(
      "backfillDeliveryTeamBankAccounts(client, fetched.records)",
    );
    expect(source).toContain('.is("bank_account", null)');
  });

  it("maps Bubble Delivery_DS_Shipping Method onto orders", () => {
    const mapping = coreMappings.find((item) => item.sourceType === "a_order");
    expect(mapping).toBeTruthy();
    const row = mapping!.map({
      _id: "order-1",
      "Delivery_DS_Shipping Method": "1678870660114x185437087924224000",
    });
    expect(row.shipping_method_legacy_id).toBe(
      "1678870660114x185437087924224000",
    );
    expect(
      mapping!.relations?.some((item) => item.idField === "shipping_method_id"),
    ).toBe(true);
  });

  it("extracts order tags and the fallback delivery district from A_Order", () => {
    expect(orderMetadataFromRecord({
      _id: "order-1",
      ORDER_tag: ["tag-1", "tag-2", "tag-1"],
      "Delivery_DS_Deli District": "district-1",
    })).toEqual({
      orderLegacyId: "order-1",
      tagLegacyIds: ["tag-1", "tag-2"],
      districtLegacyId: "district-1",
    });
    expect(fallbackDeliveryLegacyId("order-1")).toBe(
      "bubble-order-fallback-delivery-order-1",
    );
  });

  it("runs the A_Order metadata hook for daily sync and exposes a full backfill", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase/functions/bubble-daily-incremental/index.ts",
      ),
      "utf8",
    );

    expect(source).toContain("syncOrderMetadata(client, fetched.records)");
    expect(source).toContain("backfillOrderMetadata");
    expect(source).toContain("body?.cursor");
    expect(source).toContain("nextCursor");
    expect(source).toContain("order_tag_assignments");
    expect(source).toContain("delivery.district_id ? []");
  });

  it("maps Bubble fulfill and take timestamps onto deliveries", () => {
    const mapping = coreMappings.find(
      (item) => item.sourceType === "b_deliveryschedule",
    );
    expect(mapping).toBeTruthy();
    const row = mapping!.map({
      _id: "delivery-1",
      "fulfill_date&time(trigger A_order)": "2026-08-01T12:37:00.000Z",
      "take_date&time": "2026-08-01T12:15:54.000Z",
      "OS driver delivery status": "已送達",
    });
    expect(row.fulfilled_at).toBe("2026-08-01T12:37:00.000Z");
    expect(row.taken_at).toBe("2026-08-01T12:15:54.000Z");
    expect(row.delivery_status).toBe("已送達");
  });

  it("fills only missing motorcade UUID links on existing deliveries", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase/functions/bubble-daily-incremental/index.ts",
      ),
      "utf8",
    );

    expect(source).toContain("resolveRelations(client, rows, mapping.relations)");
    expect(source).toContain("motorcade_id: row.motorcade_id");
    expect(source).toContain('.is("motorcade_id", null)');
  });

  it("preserves Supabase values when Bubble omits the source field", () => {
    const merged = mergeOverwriteRow(
      "a_order",
      {
        _id: "bubble-order",
        "Modified Date": "2026-08-24T01:00:00.000Z",
        "ORDER_Grand total": 123,
      },
      {
        legacy_id: "bubble-order",
        bubble_modified_at: "2026-08-24T01:00:00.000Z",
        grand_total: 123,
        factory_print_date: null,
      },
      {
        legacy_id: "bubble-order",
        bubble_modified_at: "2026-08-23T01:00:00.000Z",
        grand_total: 100,
        factory_print_date: "2026-08-20T02:00:00.000Z",
      },
    );

    expect(merged.grand_total).toBe(123);
    expect(merged.factory_print_date).toBe("2026-08-20T02:00:00.000Z");
    expect(changedOverwriteFields(merged, {
      bubble_modified_at: "2026-08-23T01:00:00.000Z",
      grand_total: 100,
      factory_print_date: "2026-08-20T02:00:00.000Z",
    })).toEqual(["bubble_modified_at", "grand_total"]);
  });

  it("normalizes Shopify and Bubble order number formatting", () => {
    expect(normalizeOrderNumber("B - 1546")).toBe("B1546");
    expect(normalizeOrderNumber("b1546")).toBe("B1546");
  });

  it("treats equivalent timestamp and numeric representations as unchanged", () => {
    expect(changedOverwriteFields(
      {
        legacy_id: "order-1",
        delivery_at: "2026-08-24T01:00:00.000Z",
        grand_total: 123,
      },
      {
        legacy_id: "order-1",
        delivery_at: "2026-08-24T01:00:00+00:00",
        grand_total: "123.00",
      },
    )).toEqual([]);
  });

  it("preserves Shopify-owned identity and outstanding on a linked order", () => {
    const merged = mergeOverwriteRow(
      "a_order",
      { _id: "bubble-order", Shopify_NewOrder: false, ORDER_oustanding: 500 },
      { legacy_id: "bubble-order", is_shopify_order: false, outstanding: 500 },
      {
        legacy_id: "bubble-order",
        shopify_order_id: 123,
        is_shopify_order: true,
        outstanding: 0,
      },
    );
    expect(merged.is_shopify_order).toBe(true);
    expect(merged.outstanding).toBe(0);
  });
});
