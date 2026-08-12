import { createClient } from "npm:@supabase/supabase-js@2";

const BASE = "https://cs.foodchannels-catering.com/api/1.1/obj";
const SNAPSHOT = "2026-08-12T02:39:34.000Z";
const CONFIRMATION = "IMPORT PHASE E TO MAIN";
const ALLOWED = new Set([
  "shop_dailysales", "shop_ds_holiday", "shop_ds_new_product",
  "shop_ds_staff_list", "shop_ds_time_slot", "shop_dscost",
  "shop_dscost_type", "shop_dspaymentmethod", "shop_dsrestro_period",
  "shop_food_deli_platform", "shop_ingredients", "shop_monthly_cost",
  "shop_roster", "shop_stocktake", "shop_supplier_purchase",
  "shopds_purchasetype",
]);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const text = (v: unknown) => typeof v === "string" && v ? v : null;
const num = (v: unknown) => typeof v === "number" ? v : null;
const bool = (v: unknown, fallback = false) =>
  typeof v === "boolean" ? v : fallback;
const list = (v: unknown) =>
  Array.isArray(v) ? v.filter((item) => typeof item === "string") : [];
const date = (v: unknown) => {
  const parsed = new Date(v as string);
  return typeof v === "string" && !Number.isNaN(parsed.getTime())
    ? parsed.toISOString()
    : null;
};
const legacy = (row: Record<string, unknown>) => {
  if (typeof row._id !== "string" || !row._id) throw new Error("Missing _id");
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
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!).default;
}
async function ids(client: any, table: string, values: Array<string | null>) {
  const unique = [...new Set(values.filter(Boolean) as string[])];
  const result = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 100) {
    const { data, error } = await client.from(table).select("id,legacy_id")
      .in("legacy_id", unique.slice(i, i + 100));
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
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await client.from(table).upsert(rows.slice(i, i + 500), {
      onConflict,
    });
    if (error) throw error;
  }
}
async function pages(
  type: string,
  cursor: number,
  constraints: Record<string, unknown>[],
) {
  const records: Record<string, unknown>[] = [];
  let next = cursor;
  let remaining = 0;
  for (let request = 0; request < 10; request++) {
    const query = new URLSearchParams({
      limit: "100",
      cursor: String(next),
      constraints: JSON.stringify([
        ...constraints,
        { key: "Created Date", constraint_type: "less than", value: SNAPSHOT },
      ]),
    });
    const response = await fetch(
      `${BASE}/${encodeURIComponent(type)}?${query}`,
    );
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
  relations: Array<[string, string]>,
) {
  for (const row of rows) {
    for (const [legacyField, idField] of relations) {
      if (row[legacyField] && !row[idField]) {
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
    const result = await pages(
      type,
      Number(body.cursor || 0),
      Array.isArray(body.constraints) ? body.constraints : [],
    );
    const source = result.records;
    let junctions = 0;

    const simple: Record<string, [string, (row: any) => any]> = {
      shop_dspaymentmethod: ["restaurant_payment_methods", (row) => ({
        legacy_id: legacy(row),
        name: text(row["Shop_payment method"]) || legacy(row),
        sort_order: num(row.sort),
        deducts_petty_cash: bool(row["扣零用金"]),
        is_active: bool(row.active, true),
        ...metadata(row),
      })],
      shop_dsrestro_period: ["restaurant_service_periods", (row) => ({
        legacy_id: legacy(row),
        name: text(row["period name"]) || legacy(row),
        sort_order: num(row.sort),
        is_active: bool(row.active, true),
        ...metadata(row),
      })],
      shop_food_deli_platform: ["restaurant_delivery_platforms", (row) => ({
        legacy_id: legacy(row),
        name: text(row.platform_name) || legacy(row),
        sort_order: num(row.sort),
        is_active: bool(row.active, true),
        ...metadata(row),
      })],
      shop_ds_new_product: ["restaurant_new_products", (row) => ({
        legacy_id: legacy(row),
        name: text(row.new_product_name) || legacy(row),
        remarks_enabled: bool(row.remarks),
        remarks_placeholder: text(row.remarks_placeholder),
        is_active: bool(row.active, true),
        ...metadata(row),
      })],
      shop_dscost_type: ["restaurant_cost_types", (row) => ({
        legacy_id: legacy(row),
        name: text(row["Cost Type"]) || legacy(row),
        sort_order: num(row.sort_order),
        ...metadata(row),
      })],
      shopds_purchasetype: ["restaurant_purchase_types", (row) => ({
        legacy_id: legacy(row),
        name: text(row["purchase type"]) || legacy(row),
        sort_order: num(row.Sort),
        is_active: bool(row.Active, true),
        ...metadata(row),
      })],
    };
    if (simple[type]) {
      const [table, mapper] = simple[type];
      await upsert(client, table, source.map(mapper));
    }

    if (type === "shop_dscost") {
      const typeMap = await ids(
        client,
        "restaurant_cost_types",
        source.map((row) => text(row["Cost Type"])),
      );
      const rows = source.map((row) => {
        const typeLegacyId = text(row["Cost Type"]);
        return {
          legacy_id: legacy(row),
          cost_type_id: typeLegacyId ? typeMap.get(typeLegacyId) : null,
          cost_type_legacy_id: typeLegacyId,
          name: text(row["cost name"]) || legacy(row),
          sort_order: num(row.sort_order),
          is_active: bool(row.active, true),
          ...metadata(row),
        };
      });
      requireResolved(rows, [["cost_type_legacy_id", "cost_type_id"]]);
      await upsert(client, "restaurant_costs", rows);
    }

    if (type === "shop_ingredients") {
      const supplierMap = await ids(
        client,
        "suppliers",
        source.map((row) => text(row.Supplier)),
      );
      const rows = source.map((row) => {
        const supplierLegacyId = text(row.Supplier);
        return {
          legacy_id: legacy(row),
          supplier_id: supplierLegacyId
            ? supplierMap.get(supplierLegacyId)
            : null,
          supplier_legacy_id: supplierLegacyId,
          name: text(row["Display Name"]) || legacy(row),
          unit: text(row.unit),
          cost_per_unit: num(row["cost/Unit"]),
          is_active: bool(row.active, true),
          ...metadata(row),
        };
      });
      requireResolved(rows, [["supplier_legacy_id", "supplier_id"]]);
      await upsert(client, "restaurant_ingredients", rows);
      const ingredientMap = await ids(
        client,
        "restaurant_ingredients",
        rows.map((row) => row.legacy_id as string),
      );
      const links = source.flatMap((row) =>
        list(row.shop_depart).map((departmentName) => ({
          restaurant_ingredient_id: ingredientMap.get(legacy(row)),
          restaurant_ingredient_legacy_id: legacy(row),
          department_name: departmentName,
        }))
      );
      requireResolved(links, [[
        "restaurant_ingredient_legacy_id",
        "restaurant_ingredient_id",
      ]]);
      await upsert(
        client,
        "restaurant_ingredient_departments",
        links,
        "restaurant_ingredient_id,department_name",
      );
      junctions = links.length;
    }

    if (type === "shop_dailysales") {
      const restaurantMap = await ids(
        client,
        "restaurants",
        source.map((row) => text(row.restro)),
      );
      const paymentMap = await ids(
        client,
        "restaurant_payment_methods",
        source.map((row) => text(row["SHOP_DS pyament method"])),
      );
      const periodMap = await ids(
        client,
        "restaurant_service_periods",
        source.map((row) => text(row.SHOP_DS_time_period)),
      );
      const departmentMap = await ids(
        client,
        "restaurant_departments",
        source.map((row) => text(row.SHOP_DS_restro_depart)),
      );
      const platformMap = await ids(
        client,
        "restaurant_delivery_platforms",
        source.map((row) => text(row.SHOP_food_deli_platform)),
      );
      const productMap = await ids(
        client,
        "restaurant_new_products",
        source.map((row) => text(row.SHOP_DS_new_product)),
      );
      const rows = source.map((row) => {
        const restaurant = text(row.restro);
        const payment = text(row["SHOP_DS pyament method"]);
        const period = text(row.SHOP_DS_time_period);
        const department = text(row.SHOP_DS_restro_depart);
        const platform = text(row.SHOP_food_deli_platform);
        const product = text(row.SHOP_DS_new_product);
        return {
          legacy_id: legacy(row),
          restaurant_id: restaurant ? restaurantMap.get(restaurant) : null,
          restaurant_legacy_id: restaurant,
          payment_method_id: payment ? paymentMap.get(payment) : null,
          payment_method_legacy_id: payment,
          service_period_id: period ? periodMap.get(period) : null,
          service_period_legacy_id: period,
          restaurant_department_id: department
            ? departmentMap.get(department)
            : null,
          restaurant_department_legacy_id: department,
          delivery_platform_id: platform ? platformMap.get(platform) : null,
          delivery_platform_legacy_id: platform,
          new_product_id: product ? productMap.get(product) : null,
          new_product_legacy_id: product,
          sales_at: date(row.date),
          amount: num(row.amount),
          quantity: num(row.quantity),
          sort_order: num(row.sort),
          is_control_total: bool(row.controlTotal),
          is_remark_section: bool(row.RemarkSection),
          has_image: bool(row.image),
          image_url: text(row.image),
          pos_sheet_url: text(row["POS sheet"]),
          petty_cash: bool(row.pettyCash),
          petty_cash_amount: num(row.pettyCash_amount),
          remarks: text(row.Remarks),
          real_cash_count_amount: num(row.Realcash_count_amount),
          real_cash_count: num(row.Realcash_count),
          manager_hours_department: text(row["OS shop man hr depart"]),
          working_hours: num(row["Working Hour"]),
          average_per_working_hour: num(row["avg$/working hour"]),
          ...metadata(row),
        };
      });
      requireResolved(rows, [
        ["restaurant_legacy_id", "restaurant_id"],
        ["payment_method_legacy_id", "payment_method_id"],
        ["service_period_legacy_id", "service_period_id"],
        ["restaurant_department_legacy_id", "restaurant_department_id"],
        ["delivery_platform_legacy_id", "delivery_platform_id"],
        ["new_product_legacy_id", "new_product_id"],
      ]);
      await upsert(client, "restaurant_daily_sales", rows);
    }

    if (type === "shop_monthly_cost") {
      const restaurantMap = await ids(
        client,
        "restaurants",
        source.map((row) => text(row.Restro)),
      );
      const costMap = await ids(
        client,
        "restaurant_costs",
        source.map((row) => text(row.cost)),
      );
      const typeMap = await ids(
        client,
        "restaurant_cost_types",
        source.map((row) => text(row.Cost_type)),
      );
      const rows = source.map((row) => {
        const restaurant = text(row.Restro);
        const cost = text(row.cost);
        const costType = text(row.Cost_type);
        return {
          legacy_id: legacy(row),
          restaurant_id: restaurant ? restaurantMap.get(restaurant) : null,
          restaurant_legacy_id: restaurant,
          cost_id: cost ? costMap.get(cost) : null,
          cost_legacy_id: cost,
          cost_type_id: costType ? typeMap.get(costType) : null,
          cost_type_legacy_id: costType,
          month_at: date(row.month),
          amount: num(row.amount),
          cost_type_sort: num(row.cost_type_sort),
          can_proceed_pnl: bool(row.Can_proceed_PNL),
          remarks: text(row.Remarks),
          ...metadata(row),
        };
      });
      requireResolved(rows, [
        ["restaurant_legacy_id", "restaurant_id"],
        ["cost_legacy_id", "cost_id"],
        ["cost_type_legacy_id", "cost_type_id"],
      ]);
      await upsert(client, "restaurant_monthly_costs", rows);
    }

    if (type === "shop_stocktake") {
      const restaurantMap = await ids(
        client,
        "restaurants",
        source.map((row) => text(row.Shop_restro)),
      );
      const ingredientMap = await ids(
        client,
        "restaurant_ingredients",
        source.map((row) => text(row.shop_ingredients)),
      );
      const supplierMap = await ids(
        client,
        "suppliers",
        source.map((row) => text(row.Supplier)),
      );
      const rows = source.map((row) => {
        const restaurant = text(row.Shop_restro);
        const ingredient = text(row.shop_ingredients);
        const supplier = text(row.Supplier);
        return {
          legacy_id: legacy(row),
          restaurant_id: restaurant ? restaurantMap.get(restaurant) : null,
          restaurant_legacy_id: restaurant,
          restaurant_ingredient_id: ingredient
            ? ingredientMap.get(ingredient)
            : null,
          restaurant_ingredient_legacy_id: ingredient,
          supplier_id: supplier ? supplierMap.get(supplier) : null,
          supplier_legacy_id: supplier,
          department_name: text(row["OS depart"]),
          stocktake_at: date(row.stock_date),
          quantity: num(row.quantity),
          unit_cost: num(row["unit cost"]),
          total_cost: num(row.total_cost),
          ...metadata(row),
        };
      });
      requireResolved(rows, [
        ["restaurant_legacy_id", "restaurant_id"],
        ["restaurant_ingredient_legacy_id", "restaurant_ingredient_id"],
        ["supplier_legacy_id", "supplier_id"],
      ]);
      await upsert(client, "restaurant_stocktake_events", rows);
    }

    if (type === "shop_supplier_purchase") {
      const restaurantMap = await ids(
        client,
        "restaurants",
        source.map((row) => text(row.Restro)),
      );
      const supplierMap = await ids(
        client,
        "suppliers",
        source.map((row) => text(row.supplier)),
      );
      const purchaseMap = await ids(
        client,
        "restaurant_purchase_types",
        source.map((row) => text(row.type)),
      );
      const rows = source.map((row) => {
        const restaurant = text(row.Restro);
        const supplier = text(row.supplier);
        const purchaseType = text(row.type);
        return {
          legacy_id: legacy(row),
          restaurant_id: restaurant ? restaurantMap.get(restaurant) : null,
          restaurant_legacy_id: restaurant,
          supplier_id: supplier ? supplierMap.get(supplier) : null,
          supplier_legacy_id: supplier,
          purchase_type_id: purchaseType
            ? purchaseMap.get(purchaseType)
            : null,
          purchase_type_legacy_id: purchaseType,
          purchased_at: date(row.date),
          amount: num(row.amount),
          ...metadata(row),
        };
      });
      requireResolved(rows, [
        ["restaurant_legacy_id", "restaurant_id"],
        ["supplier_legacy_id", "supplier_id"],
        ["purchase_type_legacy_id", "purchase_type_id"],
      ]);
      await upsert(client, "restaurant_supplier_purchases", rows);
    }

    return respond({
      sourceType: type,
      imported: source.length,
      junctions,
      nextCursor: result.next,
      remaining: result.remaining,
      done: result.remaining === 0,
    });
  } catch (error) {
    return respond({
      error: error instanceof Error ? error.message : "Phase E failed",
    }, 400);
  }
});
