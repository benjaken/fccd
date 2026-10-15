import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const user = "00000000-0000-0000-0000-000000000001";
const org = "00000000-0000-0000-0000-000000000011";
let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema private;
    create table customer_organizations(id uuid primary key, name text, br_number text, br_expires_on date, settlement_cycle text);
    create table customer_organization_contacts(name text, phone text, title text, is_primary boolean, organization_id uuid, created_at timestamptz default now());
    create function private.customer_organization(p_admin boolean default false) returns uuid language sql as $$ select '${org}'::uuid $$;
    insert into customer_organizations values('${org}','甲公司','BR-88','2027-06-30','monthly');
    insert into customer_organization_contacts(name, phone, title, is_primary, organization_id) values('陳先生','91234567','經理',true,'${org}');
    select set_config('test.user_id','${user}',false);`);
  await db.exec(readFileSync("supabase/migrations/20261014160000_customer_company_profile.sql", "utf8"));
}, 20000);
afterEach(async () => { await db.close(); });

describe("company profile", () => {
  it("returns registration details and contacts for the selected company", async () => {
    const company = (await db.query<{ data: { name: string; brNumber: string; settlementCycle: string; contacts: Array<{ name: string }> } }>("select customer_portal_company() data")).rows[0].data;
    expect(company.name).toBe("甲公司");
    expect(company.brNumber).toBe("BR-88");
    expect(company.settlementCycle).toBe("monthly");
    expect(company.contacts[0].name).toBe("陳先生");
    expect(JSON.stringify(company)).not.toContain("object_path");
  });
});
