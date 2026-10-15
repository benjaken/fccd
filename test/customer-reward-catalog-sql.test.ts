import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const user = "00000000-0000-0000-0000-000000000001";
const org = "00000000-0000-0000-0000-000000000004";
const request = "00000000-0000-0000-0000-000000000008";
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
    create function private.customer_organization(p_admin boolean default false) returns uuid language sql as $$select '${org}'::uuid$$;
    create function private.customer_portal_ops_require(p_manage boolean default false) returns void language plpgsql as $$begin end$$;
    create table customer_organizations(id uuid primary key, name text);
    create table customer_personal_reward_accounts(user_id uuid primary key);
    create table customer_personal_reward_entries(id uuid primary key default gen_random_uuid(), user_id uuid, points bigint, remaining_points bigint, kind text, order_id uuid, event_key text unique, expires_at timestamptz, available_at timestamptz, created_at timestamptz default now());
    create function private.customer_personal_reward_balance(p_user uuid) returns bigint language sql as $$
      select coalesce(sum(points) filter (where available_at is null or available_at<=now()),0)::bigint from customer_personal_reward_entries where user_id=p_user$$;
    create table customer_reward_accounts(organization_id uuid primary key);
    create table customer_reward_entries(id uuid primary key default gen_random_uuid(), organization_id uuid, points bigint, remaining_points bigint, kind text, order_id uuid, actor_id uuid, event_key text unique, expires_at timestamptz, available_at timestamptz, created_at timestamptz default now());
    create function private.customer_reward_balance(p_org uuid) returns bigint language sql as $$
      select coalesce(sum(points) filter (where available_at is null or available_at<=now()),0)::bigint from customer_reward_entries where organization_id=p_org$$;
    insert into auth.users values('${user}','person@example.com',now());
    insert into customer_organizations values('${org}','示例公司');
    insert into customer_personal_reward_entries(user_id,points,remaining_points,kind,event_key,available_at) values('${user}',4,4,'earn','earn:test',now()-interval '1 minute');
    insert into customer_reward_entries(organization_id,points,remaining_points,kind,event_key,available_at) values('${org}',4,4,'earn','earn:org',now()-interval '1 minute');
    select set_config('test.user_id','${user}',false);`);
  await db.exec(readFileSync("supabase/migrations/20261014090000_customer_reward_catalog.sql", "utf8"));
  await db.exec(`insert into customer_reward_catalog(id,name,kind,points_cost,stock) values
    ('00000000-0000-0000-0000-000000000021','保溫袋','gift',3,2),
    ('00000000-0000-0000-0000-000000000022','現金券','voucher',5,1);`);
}, 20000);
afterEach(async () => { await db.close(); });

describe("reward catalog redemption", () => {
  it("spends points on a gift without reducing an order and does not repeat the same request", async () => {
    const first = (await db.query<{ data: { id: string; balance: number } }>("select customer_personal_redeem_catalog($1,$2) data", [request, "00000000-0000-0000-0000-000000000021"])).rows[0].data;
    const again = (await db.query<{ data: { id: string; balance: number } }>("select customer_personal_redeem_catalog($1,$2) data", [request, "00000000-0000-0000-0000-000000000021"])).rows[0].data;
    const stock = (await db.query<{ stock: number }>("select stock from customer_reward_catalog where name='保溫袋'")).rows[0].stock;
    expect(first.balance).toBe(1);
    expect(again).toEqual(first);
    expect(Number(stock)).toBe(1);
    await expect(db.query("select customer_personal_redeem_catalog($1,$2)", ["00000000-0000-0000-0000-000000000009", "00000000-0000-0000-0000-000000000022"])).rejects.toThrow("insufficient_points");
    const orders = (await db.query<{ n: string }>("select count(*) n from customer_reward_catalog_redemptions")).rows[0].n;
    expect(Number(orders)).toBe(1);
  });

  it("lets an organization redeem from its own balance", async () => {
    const result = (await db.query<{ data: { balance: number } }>("select customer_portal_redeem_catalog($1,$2) data", [request, "00000000-0000-0000-0000-000000000021"])).rows[0].data;
    expect(result.balance).toBe(1);
    const row = (await db.query<{ organization_id: string; user_id: string | null }>("select organization_id, user_id from customer_reward_catalog_redemptions")).rows[0];
    expect(row.organization_id).toBe(org);
    expect(row.user_id).toBeNull();
  });
});
