import { createClient } from "npm:@supabase/supabase-js@2";

const BASE = "https://cs.foodchannels-catering.com/api/1.1/obj";
const SNAPSHOT = "2026-08-12T02:39:34.000Z";
const CONFIRMATION = "IMPORT PHASE D2 TO MAIN";
const ALLOWED = new Set([
  "m_cal_to_kg",
  "m_calculation%",
  "m_customer",
  "m_rawmeat",
  "m_donemeat",
  "m_seasoning",
  "m_shippingmethod",
  "m_outdone_order",
  "m_outdone_donemeat",
  "m_raw_stock",
  "m_donemeat_stock",
  "m_meatseasoning_cost",
  "m_monthly_meatprice",
  "s_ingredient_stocktake",
  "s_packing_stocktake",
]);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const text = (value: unknown) =>
  typeof value === "string" && value ? value : null;
const num = (value: unknown) => typeof value === "number" ? value : null;
const bool = (value: unknown, fallback = false) =>
  typeof value === "boolean" ? value : fallback;
const list = (value: unknown) =>
  Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
const date = (value: unknown) => {
  const parsed = new Date(value as string);
  return typeof value === "string" && !Number.isNaN(parsed.getTime())
    ? parsed.toISOString()
    : null;
};
const legacy = (row: Record<string, unknown>) => {
  if (!row._id || typeof row._id !== "string") throw new Error("Missing _id");
  return row._id;
};
const metadata = (row: Record<string, unknown>) => ({
  bubble_created_at: date(row["Created Date"]),
  bubble_modified_at: date(row["Modified Date"]),
});
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

function serviceKey() {
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) return legacyKey;
  return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!).default;
}

async function idMap(
  client: any,
  table: string,
  values: Array<string | null>,
) {
  const unique = [...new Set(values.filter(Boolean) as string[])];
  const result = new Map<string, string>();
  for (let index = 0; index < unique.length; index += 100) {
    const { data, error } = await client
      .from(table)
      .select("id,legacy_id")
      .in("legacy_id", unique.slice(index, index + 100));
    if (error) throw error;
    data.forEach((row: any) => result.set(row.legacy_id, row.id));
  }
  return result;
}

async function upsert(
  client: any,
  table: string,
  rows: Record<string, unknown>[],
  onConflict = "legacy_id",
) {
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await client
      .from(table)
      .upsert(rows.slice(index, index + 500), { onConflict });
    if (error) throw error;
  }
}

async function page(type: string, cursor: number) {
  const records: Record<string, unknown>[] = [];
  let next = cursor;
  let remaining = 0;
  for (let request = 0; request < 10; request++) {
    const query = new URLSearchParams({
      limit: "100",
      cursor: String(next),
      constraints: JSON.stringify([{
        key: "Created Date",
        constraint_type: "less than",
        value: SNAPSHOT,
      }]),
    });
    const response = await fetch(`${BASE}/${type}?${query}`);
    const payload = await response.json();
    const rows = payload.response?.results;
    if (!response.ok || !Array.isArray(rows)) {
      throw new Error(`Bubble fetch failed for ${type}`);
    }
    records.push(...rows);
    remaining = Number(payload.response.remaining || 0);
    next += rows.length;
    if (!remaining) break;
    if (!rows.length) throw new Error(`${type} stopped with ${remaining}`);
  }
  return { records, next, remaining };
}

function requireResolved(
  rows: Record<string, unknown>[],
  relationships: Array<[string, string]>,
) {
  for (const row of rows) {
    for (const [legacyField, uuidField] of relationships) {
      if (row[legacyField] && !row[uuidField]) {
        throw new Error(`Unresolved ${legacyField}: ${row[legacyField]}`);
      }
    }
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await request.json();
    if (body.confirmation !== CONFIRMATION) {
      return respond({ error: "confirmation" }, 403);
    }
    const type = text(body.sourceType);
    if (!type || !ALLOWED.has(type)) throw new Error("Type not allowed");
    const client = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
    const result = await page(type, Number(body.cursor || 0));
    const source = result.records;
    let junctions = 0;
    let issues = 0;

    if (type === "m_cal_to_kg") {
      await upsert(client, "meat_unit_conversions", source.map((row) => ({
        legacy_id: legacy(row),
        unit: text(row.unit) || legacy(row),
        multiplier: num(row.multiplier),
        ...metadata(row),
      })));
    }

    if (type === "m_calculation%") {
      await upsert(client, "meat_calculation_settings", source.map((row) => ({
        legacy_id: legacy(row),
        is_applied: bool(row.applied),
        markup_rate: num(row["Mark-up"]),
        variation_rate: num(row.Variation),
        ...metadata(row),
      })));
    }

    if (type === "m_customer") {
      await upsert(client, "meat_customers", source.map((row) => ({
        legacy_id: legacy(row),
        customer_code: text(row.cust_code),
        name: text(row.Name) || legacy(row),
        address: text(row.address),
        phone: text(row.fone),
        contact_person: text(row["contact person"]),
        delivery_note_required: bool(row.DN_needed),
        ...metadata(row),
      })));
    }

    if (type === "m_rawmeat") {
      const supplierValues = source.flatMap((row) => list(row.Supplier));
      const supplierMap = await idMap(client, "suppliers", supplierValues);
      const rows = source.map((row) => ({
        legacy_id: legacy(row),
        sku: text(row.SKU),
        name: text(row.name) || legacy(row),
        english_name: text(row.name_Eng),
        unit: text(row.Unit),
        current_seasoning_cost: num(row.current_seasoning_cost),
        current_seasoning_code: num(row.curr_seasoning_code),
        current_markup_rate: num(row.Curr_Markup),
        current_variation_rate: num(row.curr_variation),
        sort_order: num(row.sort_order),
        can_ship_directly: bool(row.CanOut_directly),
        is_active: bool(row.Active, true),
        ...metadata(row),
      }));
      await upsert(client, "raw_meat_items", rows);
      const rawMap = await idMap(
        client,
        "raw_meat_items",
        rows.map((row) => row.legacy_id as string),
      );
      const links = source.flatMap((row) =>
        list(row.Supplier).map((supplierLegacyId) => ({
          raw_meat_item_id: rawMap.get(legacy(row)),
          raw_meat_item_legacy_id: legacy(row),
          supplier_id: supplierMap.get(supplierLegacyId),
          supplier_legacy_id: supplierLegacyId,
        }))
      );
      requireResolved(links, [
        ["raw_meat_item_legacy_id", "raw_meat_item_id"],
        ["supplier_legacy_id", "supplier_id"],
      ]);
      await upsert(
        client,
        "raw_meat_item_suppliers",
        links,
        "raw_meat_item_id,supplier_id",
      );
      junctions = links.length;
    }

    if (type === "m_donemeat") {
      const rawMap = await idMap(
        client,
        "raw_meat_items",
        source.map((row) => text(row.raw_meat)),
      );
      const rows = source.map((row) => {
        const rawLegacyId = text(row.raw_meat);
        return {
          legacy_id: legacy(row),
          raw_meat_item_id: rawLegacyId ? rawMap.get(rawLegacyId) : null,
          raw_meat_item_legacy_id: rawLegacyId,
          sku: text(row.SKU),
          name: text(row.Name) || legacy(row),
          english_name: text(row.Name_Eng),
          unit: text(row.Unit),
          kg_per_package: num(row["kg/包"]),
          sort_order: num(row.sort_order),
          is_active: bool(row.active, true),
          ...metadata(row),
        };
      });
      requireResolved(rows, [["raw_meat_item_legacy_id", "raw_meat_item_id"]]);
      await upsert(client, "prepared_meat_items", rows);
    }

    if (type === "m_seasoning") {
      await upsert(client, "seasonings", source.map((row) => ({
        legacy_id: legacy(row),
        name: text(row.name) || legacy(row),
        description: text(row.description),
        calculation_expression: text(row.calculate_expression),
        cost_per_gram: num(row["cost/g"]),
        last_updated_at: date(row.LastUpdate),
        sort_order: num(row.sort),
        ...metadata(row),
      })));
    }

    if (type === "m_shippingmethod") {
      await upsert(client, "meat_shipping_methods", source.map((row) => ({
        legacy_id: legacy(row),
        name: text(row.Method) || legacy(row),
        ...metadata(row),
      })));
    }

    if (type === "m_outdone_order") {
      const customerMap = await idMap(
        client,
        "meat_customers",
        source.map((row) => text(row.M_cust)),
      );
      const shippingMap = await idMap(
        client,
        "meat_shipping_methods",
        source.map((row) => text(row.shippingMethod)),
      );
      const rows = source.map((row) => {
        const customerLegacyId = text(row.M_cust);
        const shippingLegacyId = text(row.shippingMethod);
        return {
          legacy_id: legacy(row),
          meat_customer_id: customerLegacyId
            ? customerMap.get(customerLegacyId)
            : null,
          meat_customer_legacy_id: customerLegacyId,
          shipping_method_id: shippingLegacyId
            ? shippingMap.get(shippingLegacyId)
            : null,
          shipping_method_legacy_id: shippingLegacyId,
          order_number: text(row.orderNumber),
          order_at: date(row.orderDate),
          shipping_at: date(row.shippingDate),
          print_at: date(row.printdate),
          sent_at: date(row.senddate),
          send_to_factory: bool(row["send to factory"]),
          remarks: text(row.remarks),
          ...metadata(row),
        };
      });
      requireResolved(rows, [
        ["meat_customer_legacy_id", "meat_customer_id"],
        ["shipping_method_legacy_id", "shipping_method_id"],
      ]);
      await upsert(client, "meat_orders", rows);
    }

    if (type === "m_outdone_donemeat") {
      const orderMap = await idMap(
        client,
        "meat_orders",
        source.map((row) => text(row.M_outDone_order)),
      );
      const preparedMap = await idMap(
        client,
        "prepared_meat_items",
        source.map((row) => text(row.M_doneMeat)),
      );
      const rawMap = await idMap(
        client,
        "raw_meat_items",
        source.map((row) => text(row.M_rawMeat)),
      );
      const rows = source.map((row) => {
        const orderLegacyId = text(row.M_outDone_order);
        const preparedLegacyId = text(row.M_doneMeat);
        const rawLegacyId = text(row.M_rawMeat);
        return {
          legacy_id: legacy(row),
          meat_order_id: orderLegacyId ? orderMap.get(orderLegacyId) : null,
          meat_order_legacy_id: orderLegacyId,
          prepared_meat_item_id: preparedLegacyId
            ? preparedMap.get(preparedLegacyId)
            : null,
          prepared_meat_item_legacy_id: preparedLegacyId,
          raw_meat_item_id: rawLegacyId ? rawMap.get(rawLegacyId) : null,
          raw_meat_item_legacy_id: rawLegacyId,
          quantity: num(row.quantity),
          sort_order: num(row.sortNo),
          remarks: text(row.remarks),
          ...metadata(row),
        };
      });
      requireResolved(rows, [
        ["meat_order_legacy_id", "meat_order_id"],
        ["prepared_meat_item_legacy_id", "prepared_meat_item_id"],
        ["raw_meat_item_legacy_id", "raw_meat_item_id"],
      ]);
      await upsert(client, "meat_order_lines", rows);
    }

    if (type === "m_raw_stock") {
      const rawMap = await idMap(
        client,
        "raw_meat_items",
        source.map((row) => text(row.Raw_meat)),
      );
      const supplierMap = await idMap(
        client,
        "suppliers",
        source.map((row) => text(row.in_supplier)),
      );
      const lineMap = await idMap(
        client,
        "meat_order_lines",
        source.map((row) => text(row.M_outDone_doneMeat)),
      );
      const rows = source.map((row) => {
        const rawLegacyId = text(row.Raw_meat);
        const supplierLegacyId = text(row.in_supplier);
        const lineLegacyId = text(row.M_outDone_doneMeat);
        return {
          legacy_id: legacy(row),
          raw_meat_item_id: rawLegacyId ? rawMap.get(rawLegacyId) : null,
          raw_meat_item_legacy_id: rawLegacyId,
          supplier_id: supplierLegacyId
            ? supplierMap.get(supplierLegacyId)
            : null,
          supplier_legacy_id: supplierLegacyId,
          meat_order_line_id: lineLegacyId ? lineMap.get(lineLegacyId) : null,
          meat_order_line_legacy_id: lineLegacyId,
          movement_at: date(row.date),
          inbound_quantity_kg: num(row["in_quantity(kg)"]),
          outbound_quantity_kg: num(row["out_quantity(kg)"]),
          allocated_inbound_quantity_kg: num(row.out_from_in),
          inbound_unit_price: num(row["in_price(HKD/kg)"]),
          inbound_total_amount: num(row["in_totalAmount(HKD)"]),
          applied_seasoning_cost: num(row.applied_seasoning_cost),
          applied_seasoning_code: num(row.applied_seasoning_code),
          applied_markup_rate: num(row.applied_mark_up),
          applied_variation_rate: num(row.applied_variation),
          applied_seasoning_per_kg: num(row["applied_seasoning/kg"]),
          raw_meat_order: text(row.RawMeat_Order),
          remarks: text(row.Remarks),
          ...metadata(row),
        };
      });
      requireResolved(rows, [
        ["raw_meat_item_legacy_id", "raw_meat_item_id"],
        ["supplier_legacy_id", "supplier_id"],
        ["meat_order_line_legacy_id", "meat_order_line_id"],
      ]);
      await upsert(client, "raw_meat_stock_movements", rows);
      const movementMap = await idMap(
        client,
        "raw_meat_stock_movements",
        [
          ...rows.map((row) => row.legacy_id as string),
          ...source.flatMap((row) => list(row.rel_in_stock)),
        ],
      );
      const links = source.flatMap((row) =>
        list(row.rel_in_stock).map((inboundLegacyId) => ({
          movement_id: movementMap.get(legacy(row)),
          movement_legacy_id: legacy(row),
          inbound_movement_id: movementMap.get(inboundLegacyId),
          inbound_movement_legacy_id: inboundLegacyId,
        }))
      );
      requireResolved(links, [
        ["movement_legacy_id", "movement_id"],
        ["inbound_movement_legacy_id", "inbound_movement_id"],
      ]);
      await upsert(
        client,
        "raw_meat_stock_relations",
        links,
        "movement_id,inbound_movement_id",
      );
      junctions = links.length;
    }

    if (type === "m_donemeat_stock") {
      const preparedMap = await idMap(
        client,
        "prepared_meat_items",
        source.map((row) => text(row.DoneMeat)),
      );
      const customerMap = await idMap(
        client,
        "meat_customers",
        source.map((row) => text(row.Shop_M_cust)),
      );
      const lineMap = await idMap(
        client,
        "meat_order_lines",
        source.map((row) => text(row.M_outDone_doneMeat)),
      );
      const rows = source.map((row) => {
        const preparedLegacyId = text(row.DoneMeat);
        const customerLegacyId = text(row.Shop_M_cust);
        const lineLegacyId = text(row.M_outDone_doneMeat);
        return {
          legacy_id: legacy(row),
          prepared_meat_item_id: preparedLegacyId
            ? preparedMap.get(preparedLegacyId)
            : null,
          prepared_meat_item_legacy_id: preparedLegacyId,
          meat_customer_id: customerLegacyId
            ? customerMap.get(customerLegacyId)
            : null,
          meat_customer_legacy_id: customerLegacyId,
          meat_order_line_id: lineLegacyId ? lineMap.get(lineLegacyId) : null,
          meat_order_line_legacy_id: lineLegacyId,
          movement_at: date(row.Date),
          inbound_packages: num(row["in/包"]),
          outbound_packages: num(row["out/包"]),
          prepared_meat_order: num(row.DoneMeat_order),
          remarks: text(row.remark),
          ...metadata(row),
        };
      });
      requireResolved(rows, [
        ["prepared_meat_item_legacy_id", "prepared_meat_item_id"],
        ["meat_customer_legacy_id", "meat_customer_id"],
        ["meat_order_line_legacy_id", "meat_order_line_id"],
      ]);
      await upsert(client, "prepared_meat_stock_movements", rows);
      const preparedMovementMap = await idMap(
        client,
        "prepared_meat_stock_movements",
        rows.map((row) => row.legacy_id as string),
      );
      const rawReferences = source.flatMap((row) =>
        list(row.from_rawStock_list)
      );
      const rawMovementMap = await idMap(
        client,
        "raw_meat_stock_movements",
        rawReferences,
      );
      const links = source.flatMap((row) =>
        list(row.from_rawStock_list).map((rawLegacyId) => ({
          prepared_movement_id: preparedMovementMap.get(legacy(row)),
          prepared_movement_legacy_id: legacy(row),
          raw_stock_movement_id: rawMovementMap.get(rawLegacyId) ?? null,
          raw_stock_movement_legacy_id: rawLegacyId,
        }))
      );
      requireResolved(links, [[
        "prepared_movement_legacy_id",
        "prepared_movement_id",
      ]]);
      await upsert(
        client,
        "prepared_meat_stock_raw_sources",
        links,
        "prepared_movement_id,raw_stock_movement_legacy_id",
      );
      const orphanGroups = new Map<string, string[]>();
      for (const link of links) {
        if (!link.raw_stock_movement_id) {
          const references = orphanGroups.get(
            link.raw_stock_movement_legacy_id,
          ) ?? [];
          references.push(link.prepared_movement_legacy_id);
          orphanGroups.set(link.raw_stock_movement_legacy_id, references);
        }
      }
      const issueRows = [...orphanGroups].map(([targetLegacyId, references]) => ({
        issue_type: "orphan_reference_aggregate",
        source_type: "m_donemeat_stock",
        source_legacy_id: targetLegacyId,
        source_field: "from_rawStock_list",
        target_type: "m_raw_stock",
        target_legacy_id: targetLegacyId,
        details: {
          phase: "D2",
          affected_rows: references.length,
          source_legacy_ids: references,
        },
      }));
      await upsert(
        client,
        "data_quality_issues",
        issueRows,
        "issue_type,source_type,source_legacy_id,source_field",
      );
      junctions = links.length;
      issues = issueRows.length;
    }

    if (type === "m_meatseasoning_cost") {
      const preparedMap = await idMap(
        client,
        "prepared_meat_items",
        source.map((row) => text(row.M_doneMeat)),
      );
      const rawMap = await idMap(
        client,
        "raw_meat_items",
        source.map((row) => text(row.M_rawMeat)),
      );
      const seasoningMap = await idMap(
        client,
        "seasonings",
        source.map((row) => text(row.seasoning)),
      );
      const rows = source.map((row) => {
        const preparedLegacyId = text(row.M_doneMeat);
        const rawLegacyId = text(row.M_rawMeat);
        const seasoningLegacyId = text(row.seasoning);
        return {
          legacy_id: legacy(row),
          prepared_meat_item_id: preparedLegacyId
            ? preparedMap.get(preparedLegacyId)
            : null,
          prepared_meat_item_legacy_id: preparedLegacyId,
          raw_meat_item_id: rawLegacyId ? rawMap.get(rawLegacyId) : null,
          raw_meat_item_legacy_id: rawLegacyId,
          seasoning_id: seasoningLegacyId
            ? seasoningMap.get(seasoningLegacyId)
            : null,
          seasoning_legacy_id: seasoningLegacyId,
          production_raw_meat_kg: num(row["製作生肉份量KG"]),
          seasoning_quantity_grams: num(row["quantity(g)"]),
          total_cost: num(row["Total($*q)"]),
          unit_cost: num(row.unit_cost),
          version_code: num(row.code),
          seasoning_sort: num(row.seasoning_sort),
          is_applied: bool(row.apply),
          ...metadata(row),
        };
      });
      requireResolved(rows, [
        ["prepared_meat_item_legacy_id", "prepared_meat_item_id"],
        ["raw_meat_item_legacy_id", "raw_meat_item_id"],
        ["seasoning_legacy_id", "seasoning_id"],
      ]);
      await upsert(client, "meat_seasoning_cost_versions", rows);
    }

    if (type === "m_monthly_meatprice") {
      const rawMap = await idMap(
        client,
        "raw_meat_items",
        source.map((row) => text(row.Raw_meat)),
      );
      const rows = source.map((row) => {
        const rawLegacyId = text(row.Raw_meat);
        return {
          legacy_id: legacy(row),
          raw_meat_item_id: rawLegacyId ? rawMap.get(rawLegacyId) : null,
          raw_meat_item_legacy_id: rawLegacyId,
          month_at: date(row.Month),
          shop_price: num(row.Price_shop),
          room_price: num(row.Price_roomR),
          ...metadata(row),
        };
      });
      requireResolved(rows, [["raw_meat_item_legacy_id", "raw_meat_item_id"]]);
      await upsert(client, "meat_price_versions", rows);
    }

    if (
      type === "s_ingredient_stocktake" ||
      type === "s_packing_stocktake"
    ) {
      const referenceField = type === "s_ingredient_stocktake"
        ? "active ingredient"
        : "packing_DS_ing";
      const dateField = type === "s_ingredient_stocktake"
        ? "stocktake Date"
        : "Stocktake Date";
      const table = type === "s_ingredient_stocktake"
        ? "ingredient_stocktake_events"
        : "packing_stocktake_events";
      const ingredientMap = await idMap(
        client,
        "ingredients",
        source.map((row) => text(row[referenceField])),
      );
      const rows = source.map((row) => {
        const ingredientLegacyId = text(row[referenceField]);
        return {
          legacy_id: legacy(row),
          ingredient_id: ingredientLegacyId
            ? ingredientMap.get(ingredientLegacyId)
            : null,
          ingredient_legacy_id: ingredientLegacyId,
          stocktake_at: date(row[dateField]),
          quantity: num(row.Quantity),
          sku_snapshot: text(row.SKU),
          ...metadata(row),
        };
      });
      requireResolved(rows, [["ingredient_legacy_id", "ingredient_id"]]);
      await upsert(client, table, rows);
    }

    return respond({
      sourceType: type,
      imported: source.length,
      junctions,
      issues,
      nextCursor: result.next,
      remaining: result.remaining,
      done: result.remaining === 0,
    });
  } catch (error) {
    return respond({
      error: error instanceof Error ? error.message : "D2 failed",
    }, 400);
  }
});
