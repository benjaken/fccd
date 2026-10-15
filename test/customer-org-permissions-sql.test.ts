import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const admin = "00000000-0000-0000-0000-000000000001";
const member = "00000000-0000-0000-0000-000000000002";
const org = "00000000-0000-0000-0000-000000000011";
let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user_id',true),'')::uuid$$;
    create table customer_organizations(id uuid primary key, name text, is_active boolean default true);
    create table customer_memberships(user_id uuid, organization_id uuid, role text, is_active boolean default true, created_at timestamptz default now(), primary key (user_id, organization_id));
    create table customer_reward_catalog(id uuid primary key);
    create table customer_portal_orders(order_id uuid primary key, organization_id uuid);
    create function public.customer_portal_snapshot() returns jsonb language sql as $$ select '{}'::jsonb $$;
    create or replace function private.customer_organization(p_admin boolean default false)
    returns uuid language plpgsql as $$
    declare v_org uuid; v_role text;
    begin
      select organization_id, role into v_org, v_role from customer_memberships
        where user_id = auth.uid() and is_active order by created_at limit 1;
      if v_org is null or (p_admin and v_role is distinct from 'admin') then
        raise exception 'customer_membership_required';
      end if;
      return v_org;
    end $$;
    insert into auth.users values('${admin}','admin@example.com',now()),('${member}','member@example.com',now());
    insert into customer_organizations values('${org}','甲公司',true);
    insert into customer_memberships(user_id,organization_id,role) values('${admin}','${org}','admin'),('${member}','${org}','member');`);
  await db.exec(readFileSync("supabase/migrations/20261014120000_customer_org_permissions.sql", "utf8"));
}, 20000);
afterEach(async () => { await db.close(); });

async function asUser(id: string) {
  await db.query("select set_config('test.user_id',$1,false)", [id]);
}

describe("company member permissions", () => {
  it("lets an admin turn off member ordering without removing the admin's own access", async () => {
    await asUser(member);
    expect((await db.query<{ ok: boolean }>("select private.customer_has_permission('ordering') ok")).rows[0].ok).toBe(true);
    await asUser(admin);
    await db.query("select customer_portal_set_member_permission('ordering', false)");
    expect((await db.query<{ ok: boolean }>("select private.customer_has_permission('ordering') ok")).rows[0].ok).toBe(true);
    await asUser(member);
    expect((await db.query<{ ok: boolean }>("select private.customer_has_permission('ordering') ok")).rows[0].ok).toBe(false);
    await expect(db.query("insert into customer_portal_orders(order_id, organization_id) values(gen_random_uuid(), $1)", [org])).rejects.toThrow("permission_denied");
    await expect(db.query("select customer_portal_set_member_permission('ordering', true)")).rejects.toThrow("customer_membership_required");
    await expect(db.query("select customer_portal_set_member_permission('platform_admin', true)")).rejects.toThrow("customer_membership_required");
  });
});
