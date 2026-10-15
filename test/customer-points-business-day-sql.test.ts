import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const user = "00000000-0000-0000-0000-000000000001";
const order = "00000000-0000-0000-0000-000000000003";
const org = "00000000-0000-0000-0000-000000000004";
const orgOrder = "00000000-0000-0000-0000-000000000005";
const rule = "00000000-0000-0000-0000-000000000007";
let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user_id',true),'')::uuid$$;
    create function private.customer_personal_user() returns uuid language plpgsql as $$
      declare v_id uuid; begin select id into v_id from auth.users where id=auth.uid() and email_confirmed_at is not null;
      if v_id is null then raise exception 'email_verification_required' using errcode='42501'; end if; return v_id; end $$;
    create table customer_organizations(id uuid primary key);
    create table customer_reward_rules(id uuid primary key, hkd_per_point numeric, effective_at timestamptz, points_per_hkd numeric);
    create table customer_reward_accounts(organization_id uuid primary key);
    create table customer_reward_entries(id uuid primary key default gen_random_uuid(), organization_id uuid, points bigint, remaining_points bigint, kind text, order_id uuid, actor_id uuid, event_key text unique, expires_at timestamptz, created_at timestamptz default now());
    create function private.customer_reward_balance(p_org uuid) returns bigint language sql as $$select 0::bigint$$;
    create table customer_portal_orders(order_id uuid primary key, organization_id uuid, earned_at timestamptz, food_amount numeric, reward_rule_id uuid);
    create table orders(id uuid primary key, document_type text, delivery_status text, archived_at timestamptz);
    create table customer_personal_quotes(order_id uuid primary key, user_id uuid, menu_id uuid, request_id uuid, food_amount numeric);
    create table customer_lunchbox_menus(id uuid primary key);
    create table private.customer_personal_addresses(id uuid primary key, user_id uuid);
    insert into auth.users values('${user}','person@example.com',now());
    insert into customer_organizations values('${org}');
    insert into customer_reward_rules values('${rule}',25,now(),0);
    insert into orders values('${order}','order','已送達',null),('${orgOrder}','order','已送達',null);
    insert into customer_personal_quotes(order_id,user_id,food_amount) values('${order}','${user}',100);
    insert into customer_portal_orders(order_id,organization_id,food_amount,reward_rule_id) values('${orgOrder}','${org}',100,'${rule}');
    select set_config('test.user_id','${user}',false);`);
  await db.exec(readFileSync("supabase/migrations/20261013180000_customer_personal_points.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261013190000_customer_points_business_day.sql", "utf8"));
}, 20000);
afterEach(async () => { await db.close(); });

describe("points post one business day after completion", () => {
  it("skips Saturday and Sunday", async () => {
    const friday = (await db.query<{ at: string }>("select private.customer_points_available_at('2026-10-16 07:00:00+00') at")).rows[0].at;
    const monday = (await db.query<{ at: string }>("select private.customer_points_available_at('2026-10-12 02:00:00+00') at")).rows[0].at;
    expect(new Date(friday).toISOString()).toBe("2026-10-19T07:00:00.000Z");
    expect(new Date(monday).toISOString()).toBe("2026-10-13T02:00:00.000Z");
  });

  it("keeps the points out of the balance until that time, then posts them", async () => {
    await db.query("select customer_personal_award_completed_order($1)", [order]);
    await db.query("select customer_portal_award_completed_order($1)", [orgOrder]);
    const waiting = (await db.query<{ data: { balance: number; incoming: number } }>("select customer_personal_points() data")).rows[0].data;
    const orgBalance = (await db.query<{ balance: string }>("select private.customer_reward_balance($1) balance", [org])).rows[0].balance;
    expect(waiting).toMatchObject({ balance: 0, incoming: 4 });
    expect(Number(orgBalance)).toBe(0);
    await db.exec("update customer_personal_reward_entries set available_at=now()-interval '1 minute'");
    await db.exec("update customer_reward_entries set available_at=now()-interval '1 minute'");
    const posted = (await db.query<{ data: { balance: number; incoming: number } }>("select customer_personal_points() data")).rows[0].data;
    const postedOrg = (await db.query<{ balance: string }>("select private.customer_reward_balance($1) balance", [org])).rows[0].balance;
    expect(posted).toMatchObject({ balance: 4, incoming: 0 });
    expect(Number(postedOrg)).toBe(4);
  });

  it("voids an earn that has not posted yet when the order is cancelled", async () => {
    await db.query("select customer_personal_award_completed_order($1)", [order]);
    await db.query("select customer_personal_clawback_order($1)", [order]);
    await db.query("select customer_personal_clawback_order($1)", [order]);
    const result = (await db.query<{ data: { balance: number; pending: number; incoming: number } }>("select customer_personal_points() data")).rows[0].data;
    expect(result).toMatchObject({ balance: 0, pending: 0, incoming: 0 });
    const rows = (await db.query<{ n: string }>("select count(*) n from customer_personal_reward_entries")).rows[0].n;
    expect(Number(rows)).toBe(0);
  });
});
