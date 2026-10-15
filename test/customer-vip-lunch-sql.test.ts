import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const user = "00000000-0000-0000-0000-000000000001";
const brand = "00000000-0000-0000-0000-000000000005";
const product = "00000000-0000-0000-0000-000000000004";
const request = "00000000-0000-0000-0000-000000000019";
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
    create table orders(id uuid primary key default gen_random_uuid(), legacy_id text unique, customer_id uuid, channel_id uuid, document_type text, company_name_snapshot text,
      customer_name_snapshot text, email_snapshot text, contact_number_a_snapshot text, shipping_address_snapshot text, delivery_at timestamptz, delivery_time text,
      shipping_fee numeric, discount_amount numeric, grand_total numeric, outstanding numeric, is_shopify_order boolean, source_system text, source_quote_id uuid,
      order_number text, archived_at timestamptz, created_at timestamptz default now());
    create table order_lines(id uuid primary key default gen_random_uuid(), legacy_id text, order_id uuid, product_id uuid, sku_snapshot text, product_name_snapshot text,
      quantity numeric, unit_price numeric, total_price numeric, is_addon boolean, is_void boolean default false);
    create table customer_portal_orders(order_id uuid primary key, organization_id uuid, created_by uuid, menu_id uuid, request_id uuid, reward_rule_id uuid, food_amount numeric, points_used bigint);
    create table customer_organizations(id uuid primary key, name text, customer_id uuid);
    create table customer_addresses(id uuid primary key, organization_id uuid, label text, recipient text, phone text, address text, archived_at timestamptz);
    create table customer_reward_rules(id uuid primary key default gen_random_uuid(), effective_at timestamptz);
    create table customer_reward_accounts(organization_id uuid primary key);
    create function private.customer_organization(p_admin boolean default false) returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000aa'::uuid $$;
    create function private.customer_require_permission(p_key text) returns void language plpgsql as $$ begin if p_key is distinct from 'ordering' then raise exception 'permission_denied'; end if; end $$;
    insert into customer_organizations values('00000000-0000-0000-0000-0000000000aa','機構',null);
    insert into customer_addresses values('00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-0000000000aa','Office','陳先生','91234567','九龍',null);
    insert into customer_reward_rules(effective_at) values(now());
    create table private.customer_personal_profiles(user_id uuid primary key, name text);
    create table private.customer_personal_addresses(id uuid primary key, user_id uuid, label text, recipient text, phone text, address text);
    create table private.customer_personal_order_links(order_id uuid primary key, user_id uuid, linked_by uuid, reason text);
    insert into auth.users values('${user}','person@example.com',now());
    insert into channels values('${brand}','Cuisine',true,null);
    insert into products values('${product}','${brand}','LB-1','Chicken box','雞扒飯盒',true,null);
    insert into private.customer_personal_addresses values('00000000-0000-0000-0000-000000000008','${user}','Home','陳先生','91234567','九龍');
    select set_config('test.user_id','${user}',false); select set_config('test.has_access','1',false);`);
  await db.exec(readFileSync("supabase/migrations/20261013170000_customer_personal_lunchbox.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261014140000_customer_vip_lunch_cycles.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261014220000_customer_vip_organization_only.sql", "utf8"));
}, 20000);
afterEach(async () => { await db.close(); });

describe("VIP lunch cycles", () => {
  it("submits one quote per day before the shared cutoff and does not repeat the batch", async () => {
    const monday = (await db.query<{ id: string }>("select customer_portal_ops_upsert_lunchbox(null,$1,'星期一',current_date+1,'12:00',now()+interval '2 days',10,true) id", [brand])).rows[0].id;
    const tuesday = (await db.query<{ id: string }>("select customer_portal_ops_upsert_lunchbox(null,$1,'星期二',current_date+2,'12:00',now()+interval '2 days',10,true) id", [brand])).rows[0].id;
    for (const menu of [monday, tuesday]) {
      await db.query("select customer_portal_ops_replace_lunchbox_items($1,$2::jsonb)", [menu, JSON.stringify([{ product_id: product, unit_price: 48, available_quantity: 5 }])]);
    }
    const cycle = (await db.query<{ id: string }>("select customer_portal_ops_upsert_vip_cycle(null,'本週',now()+interval '1 day',true) id")).rows[0].id;
    await db.query("select customer_portal_ops_set_vip_cycle_menus($1,$2)", [cycle, [monday, tuesday]]);
    const regular = (await db.query<{ data: { menus: unknown[] } }>("select customer_personal_lunchbox_catalog() data")).rows[0].data;
    expect(regular.menus).toEqual([]);
    const catalog = (await db.query<{ data: Array<{ menus: unknown[] }> }>("select customer_portal_vip_catalog() data")).rows[0].data;
    expect(catalog[0].menus).toHaveLength(2);
    await expect(db.query("select customer_personal_vip_catalog()")).rejects.toThrow("organization_required");
    const days = JSON.stringify([
      { menu_id: monday, items: [{ product_id: product, quantity: 1 }] },
      { menu_id: tuesday, items: [{ product_id: product, quantity: 2 }] },
    ]);
    const first = (await db.query<{ ids: string[] }>("select customer_portal_submit_vip($1,$2,$3,$4::jsonb) ids", [request, cycle, "00000000-0000-0000-0000-000000000008", days])).rows[0].ids;
    const second = (await db.query<{ ids: string[] }>("select customer_portal_submit_vip($1,$2,$3,$4::jsonb) ids", [request, cycle, "00000000-0000-0000-0000-000000000008", days])).rows[0].ids;
    expect(first).toHaveLength(2);
    expect([...second].sort()).toEqual([...first].sort());
    expect((await db.query<{ count: string }>("select count(*)::text as count from orders where document_type='quote'")).rows[0].count).toBe("2");
    expect((await db.query<{ count: string }>("select count(*)::text as count from customer_portal_orders where organization_id='00000000-0000-0000-0000-0000000000aa'")).rows[0].count).toBe("2");
    await expect(db.query("select customer_personal_submit_vip($1,$2,$3,$4::jsonb)", [request, cycle, "00000000-0000-0000-0000-000000000008", days])).rejects.toThrow("organization_required");
    await db.query("select customer_portal_ops_upsert_vip_cycle($1,'本週',now()-interval '1 minute',true)", [cycle]);
    await expect(db.query("select customer_portal_submit_vip($1,$2,$3,$4::jsonb)", ["00000000-0000-0000-0000-000000000029", cycle, "00000000-0000-0000-0000-000000000008", days])).rejects.toThrow("menu_unavailable");
  });
});
