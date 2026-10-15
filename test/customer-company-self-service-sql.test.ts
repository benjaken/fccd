import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const user = "00000000-0000-0000-0000-000000000001";
const org = "00000000-0000-0000-0000-000000000011";
let db: PGlite;

const migration = () => readFileSync("supabase/migrations/20261016120000_customer_company_self_service.sql", "utf8");

async function addDocument(path: string) {
  await db.query("insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),'customer-br-documents',$1)", [path]);
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private; create schema storage;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    create table public.customer_organizations(id uuid primary key, name text, br_number text, br_expires_on date, settlement_cycle text);
    create table public.customer_organization_applications(id uuid primary key, applicant_user_id uuid, status text);
    create table public.customer_memberships(user_id uuid, organization_id uuid, role text, is_active boolean);
    create table public.customer_organization_contacts(id uuid primary key default gen_random_uuid(), organization_id uuid, name text, phone text, title text, is_primary boolean, created_at timestamptz default now());
    create table public.customer_organization_br_versions(id uuid primary key default gen_random_uuid(), organization_id uuid, br_number text, expires_on date, object_path text, reason text, created_by uuid);
    create function private.customer_organization(p_admin boolean default false) returns uuid language sql as $$ select '${org}'::uuid $$;
    create function private.customer_verified_applicant() returns uuid language sql as $$ select '${user}'::uuid $$;
    create function private.customer_br_path_ok(p_path text, p_scope uuid) returns boolean language sql stable as $$
      select exists(select 1 from storage.objects where name=p_path) $$;
    create function private.customer_portal_ops_require(p_manage boolean default false) returns void language plpgsql as $$ begin end $$;
    create function private.has_page_access(target text) returns boolean language sql as $$ select true $$;
    create function private.has_page_manage(target text) returns boolean language sql as $$ select true $$;
    insert into public.customer_organizations values('${org}','甲公司','BR-88','2027-06-30','monthly');
    insert into public.customer_organization_contacts(organization_id,name,phone,title,is_primary) values('${org}','陳先生','91234567','經理',true);
    insert into auth.users values('${user}','admin@example.com',now());
    select set_config('test.user_id','${user}',false);`);
  await db.exec(migration());
}, 20000);

afterEach(async () => { await db.close(); });

describe("company self-service", () => {
  it("reports no pending BR by default and replaces the contact list", async () => {
    const before = (await db.query<{ data: { pendingBr: unknown; contacts: unknown[] } }>("select customer_portal_company() data")).rows[0].data;
    expect(before.pendingBr).toBeNull();
    expect(before.contacts).toHaveLength(1);

    await db.query("select customer_portal_save_company_contacts($1::jsonb)", [
      JSON.stringify([
        { name: "李小姐", phone: "22334455", title: "採購", is_primary: false },
        { name: "王先生", phone: "98765432", title: "主管", is_primary: true },
      ]),
    ]);
    const after = (await db.query<{ data: { contacts: Array<{ name: string; primary: boolean }> } }>("select customer_portal_company() data")).rows[0].data;
    expect(after.contacts).toHaveLength(2);
    expect(after.contacts.find(contact => contact.primary)?.name).toBe("王先生");
  });

  it("submits a BR change that stays pending until reviewed", async () => {
    await addDocument(`${user}/${org}/new.pdf`);
    await db.query("select customer_portal_submit_company_br('99998888','2030-01-01',$1)", [`${user}/${org}/new.pdf`]);
    const pending = (await db.query<{ data: { brNumber: string; pendingBr: { brNumber: string } | null } }>("select customer_portal_company() data")).rows[0].data;
    expect(pending.brNumber).toBe("BR-88");
    expect(pending.pendingBr?.brNumber).toBe("99998888");

    await db.query("select customer_portal_ops_review_br_change((select id from customer_organization_br_change_requests limit 1),'approved','Verified')");
    const approved = (await db.query<{ data: { brNumber: string; pendingBr: unknown } }>("select customer_portal_company() data")).rows[0].data;
    expect(approved.brNumber).toBe("99998888");
    expect(approved.pendingBr).toBeNull();
    const versions = await db.query<{ count: number }>("select count(*)::int count from customer_organization_br_versions");
    expect(versions.rows[0].count).toBe(1);
  });

  it("keeps the stored BR when a change is rejected", async () => {
    await addDocument(`${user}/${org}/new.pdf`);
    await db.query("select customer_portal_submit_company_br('99998888','2030-01-01',$1)", [`${user}/${org}/new.pdf`]);
    await db.query("select customer_portal_ops_review_br_change((select id from customer_organization_br_change_requests limit 1),'rejected','Illegible scan')");
    const company = (await db.query<{ data: { brNumber: string } }>("select customer_portal_company() data")).rows[0].data;
    expect(company.brNumber).toBe("BR-88");
    const versions = await db.query<{ count: number }>("select count(*)::int count from customer_organization_br_versions");
    expect(versions.rows[0].count).toBe(0);
  });
});
