import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const user = "00000000-0000-0000-0000-000000000001";
const first = "00000000-0000-0000-0000-000000000011";
const second = "00000000-0000-0000-0000-000000000012";
let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user_id',true),'')::uuid$$;
    create table customer_organizations(id uuid primary key, name text, is_active boolean default true);
    create table customer_invitations(id uuid primary key);
    create table customer_organization_applications(id uuid primary key);
    create table customer_memberships(user_id uuid primary key, organization_id uuid not null, role text, is_active boolean default true, created_at timestamptz default now());
    insert into auth.users values('${user}','person@example.com',now());
    insert into customer_organizations values('${first}','甲公司',true),('${second}','乙公司',true);
    insert into customer_memberships(user_id,organization_id,role,created_at) values
      ('${user}','${first}','admin',now()-interval '2 days');
    select set_config('test.user_id','${user}',false);`);
  await db.exec(readFileSync("supabase/migrations/20261014110000_customer_multi_organization.sql", "utf8"));
  await db.query("insert into customer_memberships(user_id,organization_id,role,created_at) values($1,$2,'member',now()-interval '1 day')", [user, second]);
}, 20000);
afterEach(async () => { await db.close(); });

describe("multiple organization memberships", () => {
  it("keeps the selected organization as the only active workspace", async () => {
    const initial = (await db.query<{ data: { activeOrganizationId: string; organizations: unknown[] } }>("select customer_portal_identities() data")).rows[0].data;
    expect(initial.activeOrganizationId).toBe(first);
    expect(initial.organizations).toHaveLength(2);
    await db.query("select customer_portal_select_organization($1)", [second]);
    const switched = (await db.query<{ id: string }>("select private.customer_organization() id")).rows[0].id;
    expect(switched).toBe(second);
    await expect(db.query("select customer_portal_select_organization($1)", ["00000000-0000-0000-0000-000000000099"])).rejects.toThrow("customer_membership_required");
  });
});
