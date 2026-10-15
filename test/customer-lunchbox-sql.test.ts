import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const user = "00000000-0000-0000-0000-000000000001";
const brand = "00000000-0000-0000-0000-000000000005";
const product = "00000000-0000-0000-0000-000000000004";
const request = "00000000-0000-0000-0000-000000000009";
let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user_id',true),'')::uuid$$;
    create function private.customer_personal_user() returns uuid language plpgsql as $$
      declare v_id uuid; begin
        select id into v_id from auth.users where id=auth.uid() and email_confirmed_at is not null;
        if v_id is null then raise exception 'email_verification_required' using errcode='42501'; end if;
        return v_id; end $$;
    create function private.customer_portal_ops_require(p_manage boolean) returns void language plpgsql as $$
      begin if coalesce(current_setting('test.has_access',true),'')<>'1' then raise exception 'page_access_required' using errcode='42501'; end if; end $$;
    create table channels(id uuid primary key, name text, is_active boolean default true, archived_at timestamptz);
    create table products(id uuid primary key, channel_id uuid, sku text, name text, chinese_name text, is_active boolean default true, archived_at timestamptz);
    create table orders(id uuid primary key default gen_random_uuid(), legacy_id text unique, channel_id uuid, document_type text, company_name_snapshot text,
      customer_name_snapshot text, email_snapshot text, contact_number_a_snapshot text, shipping_address_snapshot text, delivery_at timestamptz, delivery_time text,
      shipping_fee numeric, discount_amount numeric, grand_total numeric, outstanding numeric, is_shopify_order boolean, source_system text, source_quote_id uuid,
      order_number text, archived_at timestamptz, created_at timestamptz default now());
    create table order_lines(id uuid primary key default gen_random_uuid(), legacy_id text, order_id uuid, product_id uuid, sku_snapshot text, product_name_snapshot text,
      quantity numeric, unit_price numeric, total_price numeric, is_addon boolean, is_void boolean default false);
    create table customer_portal_orders(order_id uuid primary key);
    create table private.customer_personal_profiles(user_id uuid primary key, name text);
    create table private.customer_personal_addresses(id uuid primary key, user_id uuid, label text, recipient text, phone text, address text);
    create table private.customer_personal_order_links(order_id uuid primary key, user_id uuid, linked_by uuid, reason text);
    insert into auth.users values('${user}','person@example.com',now());
    insert into channels values('${brand}','Cuisine',true,null);
    insert into products values('${product}','${brand}','LB-1','Chicken box','雞扒飯盒',true,null);
    insert into private.customer_personal_addresses values('00000000-0000-0000-0000-000000000008','${user}','Home','陳先生','91234567','九龍');
    select set_config('test.user_id','${user}',false); select set_config('test.has_access','1',false);`);
  await db.exec(readFileSync("supabase/migrations/20261013170000_customer_personal_lunchbox.sql", "utf8"));
}, 20000);
afterEach(async () => { await db.close(); });

describe("personal lunchbox quotes", () => {
  it("publishes an internal product and submits one quote without taking stock twice", async () => {
    const menu = (await db.query<{ id: string }>(
      "select customer_portal_ops_upsert_lunchbox(null,$1,'每日飯盒',current_date+1,'12:00',now()+interval '1 day',20,true) id",
      [brand],
    )).rows[0].id;
    await db.query("select customer_portal_ops_replace_lunchbox_items($1,$2::jsonb)", [menu, JSON.stringify([{ product_id: product, unit_price: 48, available_quantity: 5 }])]);
    const catalog = (await db.query<{ data: { menus: Array<{ items: Array<{ name: string }> }> } }>("select customer_personal_lunchbox_catalog() data")).rows[0].data;
    expect(catalog.menus[0].items[0].name).toBe("雞扒飯盒");
    const submit = (id = request) => db.query<{ id: string }>("select customer_personal_submit_lunchbox($1,$2,$3,$4::jsonb) id", [id, menu, "00000000-0000-0000-0000-000000000008", JSON.stringify([{ product_id: product, quantity: 2 }])]);
    const first = await submit();
    const second = await submit();
    expect(second.rows[0].id).toBe(first.rows[0].id);
    const created = (await db.query<{ document_type: string; legacy_id: string; grand_total: string }>("select document_type,legacy_id,grand_total::text from orders")).rows[0];
    expect(created).toEqual({ document_type: "quote", legacy_id: `web-quote-${first.rows[0].id}`, grand_total: "116.00" });
    expect((await db.query<{ available_quantity: number }>("select available_quantity from customer_lunchbox_items")).rows[0].available_quantity).toBe(3);
  });

  it("rejects ops without access and carts that exceed published stock", async () => {
    await db.exec(`select set_config('test.has_access','0',false)`);
    await expect(db.query("select customer_portal_ops_list_lunchboxes()")).rejects.toThrow("page_access_required");
    await db.exec(`select set_config('test.has_access','1',false)`);
    const menu = (await db.query<{ id: string }>(
      "select customer_portal_ops_upsert_lunchbox(null,$1,'每日飯盒',current_date+1,'12:00',now()+interval '1 day',0,true) id",
      [brand],
    )).rows[0].id;
    await db.query("select customer_portal_ops_replace_lunchbox_items($1,$2::jsonb)", [menu, JSON.stringify([{ product_id: product, unit_price: 48, available_quantity: 1 }])]);
    await expect(db.query("select customer_personal_submit_lunchbox($1,$2,$3,$4::jsonb)", [request, menu, "00000000-0000-0000-0000-000000000008", JSON.stringify([{ product_id: product, quantity: 2 }])])).rejects.toThrow("cart_unavailable");
  });
});
