import { createClient } from "npm:@supabase/supabase-js@2";

const BASE = "https://cs.foodchannels-catering.com/api/1.1/obj";
const SNAPSHOT = "2026-08-12T02:39:34.000Z";
const CONFIRMATION = "IMPORT PHASE D1 TO MAIN";
const ALLOWED = new Set([
  "ds_ingredients",
  "s_ingredients_product",
  "b_product_ingredients",
]);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const text = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : null);
const bool = (v: unknown, fallback = false) =>
  typeof v === "boolean" ? v : fallback;
const date = (v: unknown) => {
  const d = new Date(v as string);
  return typeof v === "string" && !Number.isNaN(d.getTime())
    ? d.toISOString()
    : null;
};
const legacy = (r: Record<string, unknown>) => {
  if (!r._id || typeof r._id !== "string") throw new Error("Missing _id");
  return r._id;
};
const metadata = (r: Record<string, unknown>) => ({
  bubble_created_at: date(r["Created Date"]),
  bubble_modified_at: date(r["Modified Date"]),
});
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
function key() {
  const old = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (old) return old;
  return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!).default;
}
async function ids(client: any, table: string, values: Array<string | null>) {
  const unique = [...new Set(values.filter(Boolean) as string[])];
  const result = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 100) {
    const { data, error } = await client
      .from(table)
      .select("id,legacy_id")
      .in("legacy_id", unique.slice(i, i + 100));
    if (error) throw error;
    data.forEach((row: any) => result.set(row.legacy_id, row.id));
  }
  return result;
}
async function upsert(client: any, table: string, rows: any[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await client
      .from(table)
      .upsert(rows.slice(i, i + 500), { onConflict: "legacy_id" });
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
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({
      limit: "100",
      cursor: String(next),
      constraints: JSON.stringify([
        ...constraints,
        {
          key: "Created Date",
          constraint_type: "less than",
          value: SNAPSHOT,
        },
      ]),
    });
    const response = await fetch(`${BASE}/${type}?${query}`);
    const payload = await response.json();
    const rows = payload.response?.results;
    if (!response.ok || !Array.isArray(rows)) throw new Error("Bubble fetch failed");
    records.push(...rows);
    remaining = Number(payload.response.remaining || 0);
    next += rows.length;
    if (!remaining) break;
    if (!rows.length) throw new Error(`${type} stopped with ${remaining}`);
  }
  return { records, next, remaining };
}
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await request.json();
    if (body.confirmation !== CONFIRMATION) return respond({ error: "confirmation" }, 403);
    const type = text(body.sourceType);
    if (!type || !ALLOWED.has(type)) throw new Error("Type not allowed");
    const client = createClient(Deno.env.get("SUPABASE_URL")!, key());
    const page = await pages(type, Number(body.cursor || 0), body.constraints || []);
    const source = page.records;
    let issues = 0;
    if (type === "ds_ingredients") {
      const supplierMap = await ids(client, "suppliers", source.map((r) => text(r.Supplier)));
      const rows = source.map((r) => {
        const supplier = text(r.Supplier);
        return {
          legacy_id: legacy(r), supplier_id: supplier ? supplierMap.get(supplier) ?? null : null,
          supplier_legacy_id: supplier, sku: text(r.SKU),
          name: text(r["Display Name"]) || legacy(r), description: text(r.Description),
          ingredient_type: text(r.Type), product_unit: text(r.ProductUnit),
          stocktake_unit: text(r.StockTakeUnit), product_quantity: num(r.productQ),
          cost_per_product_unit: num(r["cost/ProductUnit"]),
          cost_per_stocktake_unit: num(r["cost/stockTakeUnit"]),
          is_ingredient_stocktake: bool(r["食材盤點"]), is_packing_stocktake: bool(r["包裝盤點"]),
          is_active: bool(r.Active, true), ...metadata(r),
        };
      });
      if (rows.some((r) => r.supplier_legacy_id && !r.supplier_id)) throw new Error("Unresolved supplier");
      await upsert(client, "ingredients", rows);
    }
    if (type === "s_ingredients_product") {
      const ingredientMap = await ids(client, "ingredients", source.map((r) => text(r.Ingredients)));
      const productMap = await ids(client, "products", source.map((r) => text(r.Product)));
      const packageMap = await ids(client, "packages", source.map((r) => text(r.Package)));
      const rows = source.map((r) => {
        const ingredient = text(r.Ingredients), product = text(r.Product), pkg = text(r.Package);
        return { legacy_id: legacy(r), ingredient_id: ingredient ? ingredientMap.get(ingredient) ?? null : null,
          ingredient_legacy_id: ingredient, product_id: product ? productMap.get(product) ?? null : null,
          product_legacy_id: product, package_id: pkg ? packageMap.get(pkg) ?? null : null,
          package_legacy_id: pkg, quantity: num(r.Quantity), test_quantity: num(r.test), ...metadata(r) };
      });
      if (rows.some((r) => (r.ingredient_legacy_id && !r.ingredient_id) || (r.product_legacy_id && !r.product_id) || (r.package_legacy_id && !r.package_id))) throw new Error("Unresolved product ingredient");
      await upsert(client, "product_ingredients", rows);
    }
    if (type === "b_product_ingredients") {
      const orderMap = await ids(client, "orders", source.map((r) => text(r.A_order)));
      const lineMap = await ids(client, "order_lines", source.map((r) => text(r.S_order)));
      const productMap = await ids(client, "products", source.map((r) => text(r.Order_product)));
      const ingredientMap = await ids(client, "ingredients", source.map((r) => text(r.Ingredient)));
      const rows = source.map((r) => {
        const order = text(r.A_order), line = text(r.S_order), product = text(r.Order_product), ingredient = text(r.Ingredient);
        return { legacy_id: legacy(r), order_id: order ? orderMap.get(order) ?? null : null, order_legacy_id: order,
          order_line_id: line ? lineMap.get(line) ?? null : null, order_line_legacy_id: line,
          product_id: product ? productMap.get(product) ?? null : null, product_legacy_id: product,
          ingredient_id: ingredient ? ingredientMap.get(ingredient) ?? null : null, ingredient_legacy_id: ingredient,
          delivery_at: date(r["Deli_date(trigger)"]), ingredient_quantity: num(r.ing_Q),
          product_quantity: num(r["productQ(trigger)"]), calculated_quantity: num(r["ingQ*productQ(trigger)"]), ...metadata(r) };
      });
      if (rows.some((r) => (r.order_legacy_id && !r.order_id) || (r.product_legacy_id && !r.product_id) || (r.ingredient_legacy_id && !r.ingredient_id))) throw new Error("Unresolved BOM master reference");
      const orphanRows = rows.filter((r) => r.order_line_legacy_id && !r.order_line_id);
      if (orphanRows.length) {
        const issueRows = orphanRows.map((r) => ({ issue_type: "orphan_reference", source_type: type,
          source_legacy_id: r.legacy_id, source_field: "S_order", target_type: "s_order",
          target_legacy_id: r.order_line_legacy_id, details: { phase: "D1" } }));
        const { error } = await client.from("data_quality_issues").upsert(issueRows, {
          onConflict: "issue_type,source_type,source_legacy_id,source_field",
        });
        if (error) throw error;
        issues = issueRows.length;
      }
      await upsert(client, "order_bom_requirements", rows);
    }
    return respond({ sourceType: type, imported: source.length, issues, nextCursor: page.next,
      remaining: page.remaining, done: page.remaining === 0 });
  } catch (error) {
    return respond({ error: error instanceof Error ? error.message : "D1 failed" }, 400);
  }
});
