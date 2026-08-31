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
  INVENTORY_OVERWRITE_SINCE,
  directOverwriteSourceTypes,
  isFieldAwareOverwriteSourceType,
  isOverwriteSourceType,
  mergeOverwriteRow,
  normalizeOrderNumber,
  overwriteSince,
  reconciliationOwnedRow,
  isBubbleOwnedLegacyId,
} from "../supabase/functions/bubble-daily-incremental/overwrite.ts";
import {
  fallbackDeliveryLegacyId,
  orderMetadataFromRecord,
} from "../supabase/functions/bubble-daily-incremental/order-metadata.ts";

describe("bubble daily incremental helpers", () => {
  it("recognizes only Bubble-owned legacy ids during stale child cleanup", () => {
    expect(isBubbleOwnedLegacyId("1787284186595x755678151653982200")).toBe(true);
    expect(isBubbleOwnedLegacyId("shopify:hk-party-food:8320987365463:drink:1")).toBe(false);
    expect(isBubbleOwnedLegacyId("web-custom-order-line-2c371b7e-807d-49c4-83cb-e538c6d604ca")).toBe(false);
  });

  it("reconciles complete S_Order child sets whenever an A_Order changes", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase/functions/bubble-daily-incremental/index.ts",
      ),
      "utf8",
    );
    expect(source).toContain("reconcileModifiedBubbleOrderLines");
    expect(source).toContain("result.staleOrderLinesDeleted");
    expect(source).toContain("isBubbleOwnedLegacyId(row.legacy_id)");
    expect(source).toContain("parentsSkipped: bubbleOrders.length - ownedParents.length");
  });

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

  it("does not treat utensil packs as add-on order lines", () => {
    const mapping = coreMappings.find((item) => item.sourceType === "s_order");
    expect(mapping).toBeTruthy();

    expect(mapping!.map({
      _id: "utensil-line",
      newproductname: "餐具包",
      "Add-on": true,
    }).is_addon).toBe(false);
    expect(mapping!.map({
      _id: "meal-line",
      newproductname: "燒雞",
      "Add-on": true,
    }).is_addon).toBe(true);
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
    expect(source).toContain("delivery_district_id: update.districtId");
    expect(source).toContain('"is_sent_to_factory"');
    expect(source).toContain("order.is_sent_to_factory !== true");
    expect(source.indexOf("const insertedParents = await insertOnlyParents(")).toBeLessThan(
      source.indexOf("const metadata = await syncOrderMetadata(client, fetched.records)"),
    );
    expect(source).toContain("hydrateOrderLineSnapshots");
    expect(source).toContain('mapping.sourceType === "s_order"');
  });

  it("repairs delivery-backed factory board rows after direct Bubble status sync", () => {
    const migration = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20260830224000_ensure_factory_delivery_on_sync.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("ensure_factory_delivery_for_sent_order");
    expect(migration).toContain("after update of is_sent_to_factory");
    expect(migration).toContain("new.delivery_district_id is null");
    expect(migration).toContain("new.shipping_method_id is null");
    expect(migration).toContain("new.delivery_at is null");
    expect(migration).toContain("where delivery.order_id = new.id");
    expect(migration).toContain("orders.is_sent_to_factory is true");
    expect(migration).toContain("insert into public.deliveries");
  });

  it("exposes an admin-only read-only reconciliation audit", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase/functions/bubble-daily-incremental/index.ts",
      ),
      "utf8",
    );
    expect(source).toContain("processReconciliationAudit");
    expect(source).toContain("reconciliationAudit");
    expect(source).toContain('operation: "reconciliation_audit"');
    expect(source).toContain("targetWithoutBubbleCreatedAt");
    expect(source).toContain("APPLY_JULY15_RECONCILIATION");
    expect(source).toContain("reconciliationChildParentFields");
    expect(source).toContain('"shopify_order_id", "payment_status_source"');
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

  it("uses only quote and order document types for Bubble orders", () => {
    const mapping = coreMappings.find((item) => item.sourceType === "a_order");
    expect(mapping).toBeTruthy();
    expect(mapping!.map({ _id: "quote-1" }).document_type).toBe("quote");
    expect(mapping!.map({
      _id: "order-1",
      AddOrder_DONE: true,
    }).document_type).toBe("order");
  });

  it("preserves the fleet-specific district on an assigned delivery", () => {
    const merged = mergeOverwriteRow(
      "b_deliveryschedule",
      {
        _id: "delivery-1",
        "DS_delivery district": "bubble-district",
        DS_motorcade: "fleet-1",
      },
      {
        legacy_id: "delivery-1",
        district_id: "shared-district-id",
        motorcade_id: "fleet-id",
      },
      {
        legacy_id: "delivery-1",
        district_id: "fleet-specific-district-id",
        motorcade_id: "fleet-id",
      },
    );

    expect(merged.district_id).toBe("fleet-specific-district-id");
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

  it("treats Bubble precision rounded to database scale as unchanged", () => {
    expect(changedOverwriteFields(
      {
        legacy_id: "raw-stock-1",
        inbound_quantity_kg: 120.05444646098,
        inbound_total_amount: 9683.175,
        applied_seasoning_cost: 39.5078580899773,
        total_cost: 2.02235,
        unit_cost: 0.0106666666666667,
      },
      {
        legacy_id: "raw-stock-1",
        inbound_quantity_kg: "120.054",
        inbound_total_amount: "9683.18",
        applied_seasoning_cost: "39.5079",
        total_cost: "2.0224",
        unit_cost: "0.010667",
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

  it("limits inventory overwrite sources to records modified after August 10 HKT", () => {
    expect(INVENTORY_OVERWRITE_SINCE).toBe("2026-08-09T16:00:00.000Z");
    expect(overwriteSince("m_raw_stock")).toBe(INVENTORY_OVERWRITE_SINCE);
    expect(overwriteSince("m_donemeat_stock")).toBe(
      INVENTORY_OVERWRITE_SINCE,
    );
  });

  it("overwrites only supplied raw and prepared inventory fields", () => {
    const raw = mergeOverwriteRow(
      "m_raw_stock",
      { _id: "raw-1", "in_quantity(kg)": 12 },
      { legacy_id: "raw-1", inbound_quantity_kg: 12, remarks: null },
      { legacy_id: "raw-1", inbound_quantity_kg: 10, remarks: "keep" },
    );
    expect(raw.inbound_quantity_kg).toBe(12);
    expect(raw.remarks).toBe("keep");

    const prepared = mergeOverwriteRow(
      "m_donemeat_stock",
      { _id: "prepared-1", "out/包": 4 },
      { legacy_id: "prepared-1", outbound_packages: 4, remarks: null },
      { legacy_id: "prepared-1", outbound_packages: 3, remarks: "keep" },
    );
    expect(prepared.outbound_packages).toBe(4);
    expect(prepared.remarks).toBe("keep");
  });

  it("approves direct Bubble overwrite for quote and frozen-meat data", () => {
    expect(directOverwriteSourceTypes).toContain("quote_t&c");
    expect(directOverwriteSourceTypes).toContain("m_raw_stock");
    expect(directOverwriteSourceTypes).toContain("m_donemeat_stock");
    expect(isOverwriteSourceType("m_outdone_order")).toBe(true);
    expect(isFieldAwareOverwriteSourceType("a_order")).toBe(true);
    expect(isFieldAwareOverwriteSourceType("m_outdone_order")).toBe(false);
  });

  it("rebuilds direct-overwrite child links after parent upserts", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase/functions/bubble-daily-incremental/index.ts",
      ),
      "utf8",
    );
    expect(source).toContain("replaceOverwriteChildren");
    expect(source).toContain("childRowsDeleted");
    expect(source).toContain("childRowsWritten");
  });

  it("uses explicit ownership dependencies for high-risk reconciliation sources", () => {
    const row = reconciliationOwnedRow(
      "a_order",
      { _id: "order-1", "ORDER_Grand total": 250 },
      {
        legacy_id: "order-1",
        grand_total: 250,
        delivery_status: null,
        factory_print_date: null,
      },
      {
        legacy_id: "order-1",
        grand_total: 200,
        delivery_status: "local-status",
        factory_print_date: "2026-08-20T02:00:00.000Z",
      },
    );
    expect(row.grand_total).toBe(250);
    expect(row.factory_print_date).toBe("2026-08-20T02:00:00.000Z");
    expect(row).not.toHaveProperty("delivery_status");
  });
});
