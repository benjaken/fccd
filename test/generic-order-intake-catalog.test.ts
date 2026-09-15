import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { evaluateOrderIntakeWithCatalog } from "../supabase/functions/_shared/customer-service-order-intake";

const a = "00000000-0000-4000-8000-000000000001";
const b = "00000000-0000-4000-8000-000000000002";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table shopify_stores (id uuid primary key, channel_id uuid, shop_domain text, is_active boolean);
    create table shopify_catalog_drafts (store_id uuid, title text, handle text, shopify_status text, catalog_type text, tags text[]);
    insert into shopify_stores values ('${a}','${a}','a.example.com',true), ('${b}','${b}','b.example.com',true);
    insert into shopify_catalog_drafts values
      ('${a}','聖誕火雞','turkey','active','fixed_package','{聖誕}'),
      ('${a}','新春盆菜','pot-a','active','fixed_package','{新春}'),
      ('${b}','新春盆菜','pot-b','active','fixed_package','{新春}'),
      ('${b}','新春停售盆菜','inactive','draft','fixed_package','{新春}'),
      ('${a}','A新春2027套餐','2027','active','fixed_package','{}'),
      ('${a}','Z新春2026套餐','2026','active','fixed_package','{}');
  `);
  await db.exec(readFileSync("supabase/migrations/20260915160000_generic_order_intake_catalog.sql", "utf8"));
});
afterAll(async () => { await db?.close(); });

async function search(channel: string, terms: string[], limit = 8) {
  const result = await db.query<{ name: string; product_url: string }>(
    "select * from search_order_intake_catalog($1::uuid[], $2::text[], $3)", [[channel], terms, limit],
  );
  return result.rows.map((row) => ({ name: row.name, url: row.product_url }));
}
describe("generic seasonal catalog SQL and rule integration", () => {
  it("preserves brand-product pairs through the real catalog function", async () => {
    const rule = { id: "holiday", name: "節日安排", startsOn: "2026-12-24", endsOn: "2027-02-10",
      startTime: null, endTime: null, handling: "allow_only" as const,
      channels: [{ channelId: a, name: "品牌A", terms: ["聖誕火雞"] }, { channelId: b, name: "品牌B", terms: ["新春盆菜"] }] };
    const result = await evaluateOrderIntakeWithCatalog({ date: "2027-02-06", text: "品牌A新春盆菜" }, [rule], search);
    expect(result.status).toBe("manual_review");
    expect(result.recommendations.map((item) => item.url)).toEqual([
      "https://a.example.com/products/turkey", "https://b.example.com/products/pot-b",
    ]);
    const valid = await evaluateOrderIntakeWithCatalog({ date: "2027-02-06", text: "品牌B新春盆菜" }, [rule], search);
    expect(valid.status).toBe("available");
  });
  it("does not privilege a fixed year when ranking active products", async () => {
    expect((await search(a, ["新春"], 1))[0].name).toBe("A新春2027套餐");
  });
  it("keeps the catalog lookup limited to the service role", async () => {
    const result = await db.query<{ allowed: boolean }>("select has_function_privilege('authenticated', 'search_order_intake_catalog(uuid[],text[],integer)', 'execute') allowed");
    expect(result.rows[0].allowed).toBe(false);
  });
});
