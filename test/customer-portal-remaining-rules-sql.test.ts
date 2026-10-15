import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const user = "00000000-0000-0000-0000-000000000001";
const org = "00000000-0000-0000-0000-000000000011";
const order = "00000000-0000-0000-0000-000000000021";
const menu = "00000000-0000-0000-0000-000000000031";
const product = "00000000-0000-0000-0000-000000000041";
const rule = "00000000-0000-0000-0000-000000000051";
let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private;
    create table orders(id uuid primary key, order_number text, document_type text, delivery_status text, delivery_at timestamptz, grand_total numeric, shipping_fee numeric, customer_id uuid, archived_at timestamptz, created_at timestamptz default now());
    create table order_lines(order_id uuid, product_id uuid, quantity numeric, is_void boolean default false);
    create table customer_organizations(id uuid primary key, name text, customer_id uuid, is_active boolean default true);
    create table customer_portal_orders(order_id uuid primary key, organization_id uuid, reward_rule_id uuid, food_amount numeric, earned_at timestamptz);
    create table customer_reward_rules(id uuid primary key, hkd_per_point numeric, effective_at timestamptz);
    create table customer_reward_accounts(organization_id uuid primary key);
    create table customer_reward_entries(id uuid primary key default gen_random_uuid(), organization_id uuid, points bigint, remaining_points bigint default 0, kind text, order_id uuid, event_key text unique, expires_at timestamptz, available_at timestamptz, created_at timestamptz default now());
    create table customer_reward_pending(id uuid primary key default gen_random_uuid(), organization_id uuid, order_id uuid, points bigint, event_key text unique);
    create table customer_personal_quotes(order_id uuid primary key, user_id uuid, menu_id uuid, food_amount numeric, reward_rule_id uuid, earned_at timestamptz);
    create table customer_personal_reward_accounts(user_id uuid primary key);
    create table customer_personal_reward_entries(id uuid primary key default gen_random_uuid(), user_id uuid, points bigint, remaining_points bigint default 0, kind text, order_id uuid, event_key text unique, expires_at timestamptz, available_at timestamptz, created_at timestamptz default now());
    create table customer_personal_reward_pending(id uuid primary key default gen_random_uuid(), user_id uuid, order_id uuid, points bigint, event_key text unique);
    create table customer_lunchbox_items(menu_id uuid, product_id uuid, available_quantity integer);
    create table private.customer_personal_order_links(order_id uuid, user_id uuid);
    create function private.customer_organization(p_admin boolean default false) returns uuid language sql as $$ select '${org}'::uuid $$;
    create function private.customer_require_permission(p_key text) returns void language plpgsql as $$ begin if p_key <> 'export' then raise exception 'permission_denied'; end if; end $$;
    create function private.customer_reward_balance(p_org uuid) returns bigint language sql as $$ select 4::bigint $$;
    create function private.customer_personal_reward_balance(p_user uuid) returns bigint language sql as $$ select 0::bigint $$;
    create function private.customer_points_available_at(p_completed timestamptz) returns timestamptz language sql as $$ select p_completed $$;
    insert into customer_organizations values('${org}','甲公司',null,true);
    insert into customer_reward_rules values('${rule}',25,now()-interval '1 day');
    insert into orders values('${order}','FCC-9','order','已送達',now(),100,10,null,null,now());
    insert into customer_portal_orders values('${order}','${org}','${rule}',100,now());
    insert into customer_reward_entries(organization_id, points, remaining_points, kind, order_id, event_key, available_at)
      values('${org}',4,4,'earn','${order}','earn:${order}',now()-interval '2 days');`);
  await db.exec(readFileSync("supabase/migrations/20261014170000_customer_portal_remaining_rules.sql", "utf8"));
}, 20000);
afterEach(async () => { await db.close(); });

describe("remaining portal rules", () => {
  it("skips a public holiday, claws back a partial food refund, restores stock, and exports orders", async () => {
    await db.query("insert into customer_point_holidays(holiday_on, name) values('2026-10-19','補假')");
    await db.query("insert into customer_personal_reward_entries(user_id, points, remaining_points, kind, event_key, available_at) values($1,1,1,'earn','earn:holiday',$2)", [user, "2026-10-19T07:00:00Z"]);
    const shifted = (await db.query<{ at: string }>("select available_at::text as at from customer_personal_reward_entries where event_key='earn:holiday'")).rows[0].at;
    expect(shifted.startsWith("2026-10-20")).toBe(true);

    await db.query("select private.customer_apply_food_refund($1, 50)", [order]);
    const clawed = (await db.query<{ points: string }>("select points::text as points from customer_reward_entries where kind='clawback'")).rows[0].points;
    expect(clawed).toBe("-2");

    await db.query("insert into customer_personal_quotes(order_id, user_id, menu_id, food_amount) values($1,$2,$3,48)", [order, user, menu]);
    await db.query("insert into order_lines(order_id, product_id, quantity) values($1,$2,2)", [order, product]);
    await db.query("insert into customer_lunchbox_items values($1,$2,3)", [menu, product]);
    await db.query("update orders set delivery_status='已取消' where id=$1", [order]);
    expect((await db.query<{ available_quantity: number }>("select available_quantity from customer_lunchbox_items")).rows[0].available_quantity).toBe(5);

    const csv = (await db.query<{ csv: string }>("select customer_portal_export_orders() csv")).rows[0].csv;
    expect(csv).toContain("FCC-9");
  });
});
