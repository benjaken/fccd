import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const user = "00000000-0000-0000-0000-000000000001";
const org = "00000000-0000-0000-0000-000000000004";
const order = "00000000-0000-0000-0000-000000000003";
const rule = "00000000-0000-0000-0000-000000000007";
const customer = "00000000-0000-0000-0000-000000000009";
let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private;
    create function private.customer_points_available_at(p_completed timestamptz) returns timestamptz language sql as $$ select p_completed + interval '1 day' $$;
    create table orders(
      id uuid primary key,
      document_type text,
      delivery_status text,
      archived_at timestamptz,
      grand_total numeric,
      shipping_fee numeric,
      customer_id uuid,
      delivery_at timestamptz,
      payment_status_source text not null default 'manual',
      shopify_financial_status text
    );
    create table payments(
      id uuid primary key default gen_random_uuid(),
      order_id uuid,
      amount numeric not null,
      voided_at timestamptz
    );
    create table customer_reward_rules(id uuid primary key, hkd_per_point numeric, effective_at timestamptz);
    create table customer_personal_quotes(order_id uuid primary key, user_id uuid, food_amount numeric, reward_rule_id uuid, earned_at timestamptz);
    create table customer_personal_reward_accounts(user_id uuid primary key);
    create table customer_personal_reward_entries(
      id uuid primary key default gen_random_uuid(),
      user_id uuid,
      points bigint,
      remaining_points bigint,
      kind text,
      order_id uuid,
      event_key text unique,
      expires_at timestamptz,
      available_at timestamptz
    );
    create table customer_organizations(id uuid primary key, customer_id uuid, is_active boolean default true);
    create table customer_portal_orders(order_id uuid primary key, organization_id uuid, food_amount numeric, reward_rule_id uuid, earned_at timestamptz);
    create table customer_reward_accounts(organization_id uuid primary key);
    create table customer_reward_entries(
      id uuid primary key default gen_random_uuid(),
      organization_id uuid,
      points bigint,
      remaining_points bigint,
      kind text,
      order_id uuid,
      event_key text unique,
      expires_at timestamptz,
      available_at timestamptz
    );
    create table private.customer_personal_order_links(order_id uuid, user_id uuid);
    insert into customer_reward_rules values('${rule}', 25, now() - interval '1 day');
    insert into orders(id, document_type, delivery_status, grand_total, shipping_fee)
      values('${order}', 'order', '已送達', 100, 0);
    insert into customer_personal_quotes(order_id, user_id, food_amount, reward_rule_id)
      values('${order}', '${user}', 100, '${rule}');`);
  await db.exec(readFileSync("supabase/migrations/20261015022409_customer_points_after_payment_posted.sql", "utf8"));
}, 20000);
afterEach(async () => { await db.close(); });

describe("points wait for a posted payment", () => {
  it("does not award a delivered order until the payment covers the total", async () => {
    await db.query("select customer_personal_award_completed_order($1)", [order]);
    expect(Number((await db.query<{ n: string }>("select count(*) n from customer_personal_reward_entries")).rows[0].n)).toBe(0);

    await db.query("insert into payments(order_id, amount) values($1, 40)", [order]);
    expect(Number((await db.query<{ n: string }>("select count(*) n from customer_personal_reward_entries")).rows[0].n)).toBe(0);

    await db.query("insert into payments(order_id, amount) values($1, 60)", [order]);
    const points = (await db.query<{ points: string }>("select points::text as points from customer_personal_reward_entries")).rows[0].points;
    expect(points).toBe("4");
  });

  it("drops an unreleased earn when the posted payment is voided", async () => {
    await db.query("insert into payments(order_id, amount) values($1, 100)", [order]);
    await db.query("update payments set voided_at = now() where order_id = $1", [order]);
    expect(Number((await db.query<{ n: string }>("select count(*) n from customer_personal_reward_entries")).rows[0].n)).toBe(0);
    const earned = (await db.query<{ earned_at: string | null }>("select earned_at from customer_personal_quotes")).rows[0].earned_at;
    expect(earned).toBeNull();
  });

  it("awards an external order when Shopify marks it paid", async () => {
    const external = "00000000-0000-0000-0000-000000000008";
    await db.query(
      "insert into orders(id, document_type, delivery_status, grand_total, shipping_fee, customer_id, delivery_at, payment_status_source) values($1,'order','已送達',80,5,$2,now(),'shopify')",
      [external, customer],
    );
    await db.query("insert into customer_organizations(id, customer_id) values($1,$2)", [org, customer]);
    await db.query("insert into private.customer_personal_order_links(order_id, user_id) values($1,$2)", [external, user]);
    await db.query("update orders set shopify_financial_status = 'paid' where id = $1", [external]);
    const points = (await db.query<{ points: string }>("select points::text as points from customer_personal_reward_entries where order_id = $1", [external])).rows[0].points;
    expect(points).toBe("3");
  });
});
