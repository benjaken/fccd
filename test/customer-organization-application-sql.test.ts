import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let db: PGlite;
const ids = {
  staff: "00000000-0000-0000-0000-000000000001",
  applicant: "00000000-0000-0000-0000-000000000002",
  admin: "00000000-0000-0000-0000-000000000006",
  rejected: "00000000-0000-0000-0000-000000000007",
};

const contacts = JSON.stringify([{ name: "Ada", phone: "21234567", title: "Manager", is_primary: true }]);
const addresses = JSON.stringify([{ label: "Office", recipient: "Ada", phone: "21234567", address: "1 Test Road" }]);

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create schema private;create schema extensions;create schema storage;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user_id',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create table public.app_pages(page_key text primary key,display_name text,route text,sort_order int,is_high_risk boolean,parent_page_key text,page_kind text,updated_at timestamptz default now());
    create table public.role_page_permissions(role text,page_key text,can_access boolean,can_manage boolean,updated_at timestamptz default now(),primary key(role,page_key));
    create function private.has_page_access(target_page_key text) returns boolean language sql stable as $$
      select coalesce(current_setting('test.has_access',true),'')='1'$$;
    create function private.has_page_manage(target_page_key text) returns boolean language sql stable as $$
      select coalesce(current_setting('test.has_access',true),'')='1'$$;`);
  const core = readFileSync("supabase/migrations/20260812032618_create_core_catering_schema.sql", "utf8");
  for (const table of ["channels", "payment_methods", "customers", "products", "orders", "order_lines", "payments"]) {
    const definition = core.match(new RegExp(`create table public\\.${table} \\([\\s\\S]*?\\n\\);`))![0];
    await db.exec(definition.replace(/references public\.\w+ \(id\)/g, ""));
  }
  await db.exec(`alter table orders add column source_system text;alter table orders add column delivery_time text;`);
  await db.exec(readFileSync("supabase/migrations/20261012090000_customer_organization_portal.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261012170000_customer_portal_ops_admin.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261013090000_customer_organization_applications.sql", "utf8"));
  await db.exec(`select set_config('test.has_access','1',false);
    insert into auth.users values
      ('${ids.staff}','staff@example.com',now()),
      ('${ids.applicant}','applicant@example.com',now()),
      ('${ids.admin}','admin@example.com',now()),
      ('${ids.rejected}','rejected@example.com',now());`);
}, 20000);

afterEach(async () => { await db.close(); });

async function asUser(id: string) {
  await db.exec(`select set_config('test.user_id','${id}',false)`);
}

async function draftApplication(brNumber = "12345678", expires = "current_date + 30") {
  await asUser(ids.applicant);
  const id = (await db.query<{ id: string }>(
    "select customer_org_application_save('Acme Ltd',$1,null,null,'[]'::jsonb,'[]'::jsonb) id",
    [brNumber],
  )).rows[0].id;
  const path = `${ids.applicant}/${id}/br.pdf`;
  await db.query("insert into storage.objects(bucket_id,name) values('customer-br-documents',$1)", [path]);
  await db.query(
    `select customer_org_application_save('Acme Ltd',$1,${expires},$2,$3::jsonb,$4::jsonb)`,
    [brNumber, path, contacts, addresses],
  );
  return { id, path };
}

describe("customer organization BR applications", () => {
  it("keeps the applicant out of the company until FCC assigns a different admin", async () => {
    const { id } = await draftApplication();
    await db.query("select customer_org_application_submit()");
    await asUser(ids.staff);
    await db.query(
      "select customer_portal_ops_review_application($1,'needs_info','Need a clearer BR scan',null,null)",
      [id],
    );
    await asUser(ids.applicant);
    await db.query("select customer_org_application_submit()");
    await asUser(ids.staff);
    const orgId = (await db.query<{ id: string }>(
      "select customer_portal_ops_review_application($1,'approved','BR checked','monthly','admin@example.com') id",
      [id],
    )).rows[0].id;
    const again = (await db.query<{ id: string }>(
      "select customer_portal_ops_review_application($1,'approved','BR checked','monthly','admin@example.com') id",
      [id],
    )).rows[0].id;
    expect(again).toBe(orgId);

    const members = await db.query<{ user_id: string; role: string }>(
      "select user_id::text, role from customer_memberships",
    );
    expect(members.rows).toEqual([{ user_id: ids.admin, role: "admin" }]);
    const org = await db.query<{ settlement_cycle: string; br_number: string }>(
      "select settlement_cycle, br_number from customer_organizations where id=$1",
      [orgId],
    );
    expect(org.rows[0]).toEqual({ settlement_cycle: "monthly", br_number: "12345678" });
    const versions = await db.query<{ count: string }>(
      "select count(*)::text as count from customer_organization_br_versions where application_id=$1",
      [id],
    );
    expect(versions.rows[0].count).toBe("2");

    await asUser(ids.applicant);
    const own = await db.query<{ status: string }>("select customer_org_application_current()->>'status' as status");
    expect(own.rows[0].status).toBe("approved");
    await expect(db.query(
      "select customer_org_application_save('Another Ltd','12345678',current_date+30,null,'[]'::jsonb,'[]'::jsonb)",
    )).rejects.toThrow("application_already_approved");
  });

  it("rejects another applicant, blocks foreign attachments, and enforces a published expiry policy", async () => {
    await asUser(ids.rejected);
    const rejectedId = (await db.query<{ id: string }>(
      "select customer_org_application_save('Reject Co','87654321',current_date+10,null,'[]'::jsonb,'[]'::jsonb) id",
    )).rows[0].id;
    const rejectedPath = `${ids.rejected}/${rejectedId}/br.pdf`;
    await db.query("insert into storage.objects(bucket_id,name) values('customer-br-documents',$1)", [rejectedPath]);
    await db.query(
      "select customer_org_application_save('Reject Co','87654321',current_date+10,$1,$2::jsonb,$3::jsonb)",
      [rejectedPath, contacts, addresses],
    );
    await db.query("select customer_org_application_submit()");
    await asUser(ids.staff);
    await db.query(
      "select customer_portal_ops_review_application($1,'rejected','BR does not match',null,null)",
      [rejectedId],
    );
    const memberships = await db.query<{ count: string }>("select count(*)::text as count from customer_memberships");
    expect(memberships.rows[0].count).toBe("0");

    await asUser(ids.applicant);
    await expect(db.query(
      "select customer_org_application_save('Stolen Ltd','12345678',current_date+10,$1,$2::jsonb,$3::jsonb)",
      [rejectedPath, contacts, addresses],
    )).rejects.toThrow("invalid_br_attachment");

    const { id, path } = await draftApplication("12345678");
    await db.query("select customer_org_application_submit()");
    await asUser(ids.staff);
    await db.exec(`select set_config('test.has_access','0',false)`);
    await expect(db.query("select customer_portal_ops_list_applications()")).rejects.toThrow("page_access_required");
    await db.exec(`select set_config('test.has_access','1',false)`);
    const orgId = (await db.query<{ id: string }>(
      "select customer_portal_ops_review_application($1,'approved','Checked','weekly','admin@example.com') id",
      [id],
    )).rows[0].id;

    expect((await db.query<{ blocked: boolean }>(
      "select private.customer_br_blocks_new_orders($1) blocked",
      [orgId],
    )).rows[0].blocked).toBe(false);
    await db.query(
      "update customer_organizations set br_expires_on=((now() at time zone 'Asia/Hong_Kong')::date - 1) where id=$1",
      [orgId],
    );
    await db.query(
      "select customer_portal_ops_publish_br_policy(30,false,'Do not block yet')",
    );
    expect((await db.query<{ blocked: boolean }>(
      "select private.customer_br_blocks_new_orders($1) blocked",
      [orgId],
    )).rows[0].blocked).toBe(false);
    await db.query(
      "select customer_portal_ops_publish_br_policy(14,true,'Block expired BR orders')",
    );
    expect((await db.query<{ blocked: boolean }>(
      "select private.customer_br_blocks_new_orders($1) blocked",
      [orgId],
    )).rows[0].blocked).toBe(true);

    const renewPath = `${ids.staff}/${orgId}/renew.pdf`;
    await db.query("insert into storage.objects(bucket_id,name) values('customer-br-documents',$1)", [renewPath]);
    await db.query(
      "select customer_portal_ops_renew_br($1,'99998888',current_date+365,$2,'Renewed after review')",
      [orgId, renewPath],
    );
    const renewed = await db.query<{ br_number: string }>(
      "select br_number from customer_organizations where id=$1",
      [orgId],
    );
    expect(renewed.rows[0].br_number).toBe("99998888");
    const history = await db.query<{ count: string }>(
      "select count(*)::text as count from customer_organization_br_versions where organization_id=$1 or object_path=$2",
      [orgId, path],
    );
    expect(Number(history.rows[0].count)).toBeGreaterThanOrEqual(2);
    expect((await db.query<{ name: string }>("select tgname as name from pg_trigger where tgname='customer_portal_orders_br_guard'")).rows).toHaveLength(1);
  });
});
