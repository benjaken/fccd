import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let db: PGlite;
const ids = {
  user: "00000000-0000-0000-0000-000000000001",
  other: "00000000-0000-0000-0000-000000000002",
  org: "00000000-0000-0000-0000-000000000003",
  brand: "00000000-0000-0000-0000-000000000004",
  product: "00000000-0000-0000-0000-000000000005",
};

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create schema private;create schema extensions;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user_id',true),'')::uuid$$;
    create function extensions.gen_random_bytes(integer) returns bytea language sql as $$select decode(replace(gen_random_uuid()::text,'-',''),'hex')$$;
    create function extensions.digest(text,text) returns bytea language sql as $$select decode(md5($1),'hex')$$;
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
  const period = readFileSync("supabase/migrations/20261014200000_customer_menu_valid_period.sql", "utf8");
  await db.exec(period.split("\n-- ordering\n")[0]);
  await db.exec(`select set_config('test.user_id','${ids.user}',false);
    select set_config('test.has_access','1',false);
    insert into auth.users values('${ids.user}','admin@example.com',now()),('${ids.other}','member@example.com',now());
    insert into channels(id,legacy_id,name) values('${ids.brand}','brand','Catering');
    insert into products(id,legacy_id,channel_id,name,price) values('${ids.product}','product','${ids.brand}','Food',100);`);
}, 20000);

afterEach(async () => { await db.close(); });

describe("customer portal ops SQL", () => {
  it("creates orgs, assigns admins and publishes menu items", async () => {
    const orgId = (await db.query<{ id: string }>(
      "select customer_portal_ops_upsert_org(null,'Ops Org',null,true) id",
    )).rows[0].id;
    await db.query("select customer_portal_ops_assign_admin($1,'admin@example.com')", [orgId]);
    const detail = await db.query<{ d: { members: Array<{ email: string; role: string }> } }>(
      "select customer_portal_ops_get_org($1) d", [orgId],
    );
    expect(detail.rows[0].d.members).toEqual([expect.objectContaining({ email: "admin@example.com", role: "admin" })]);

    const menuId = (await db.query<{ id: string }>(
      `select customer_portal_ops_upsert_menu(null,$1,$2,'Lunch',current_date+1,current_date+7,'12:00',now()+interval '1 day',50,true) id`,
      [orgId, ids.brand],
    )).rows[0].id;
    await db.query(
      "select customer_portal_ops_replace_menu_items($1,$2::jsonb)",
      [menuId, JSON.stringify([{ product_id: ids.product, unit_price: 88, available_quantity: 12 }])],
    );
    const menu = await db.query<{ d: { valid_until: string; items: Array<{ unit_price: number; available_quantity: number }> } }>(
      "select customer_portal_ops_get_menu($1) d", [menuId],
    );
    expect(menu.rows[0].d.items).toEqual([expect.objectContaining({ unit_price: 88, available_quantity: 12 })]);
    expect(menu.rows[0].d.valid_until).toBe(
      (await db.query<{ service_day: string }>("select (current_date+7)::text as service_day")).rows[0].service_day,
    );
    await expect(db.query(
      `select customer_portal_ops_upsert_menu(null,$1,$2,'Lunch',current_date+7,current_date+1,'12:00',now()+interval '1 day',50,true)`,
      [orgId, ids.brand],
    )).rejects.toThrow("invalid_menu");
  });

  it("rejects ops without page access and blocks cross-org membership", async () => {
    await db.exec(`select set_config('test.has_access','0',false)`);
    await expect(db.query("select customer_portal_ops_list_orgs()")).rejects.toThrow("page_access_required");
    await db.exec(`select set_config('test.has_access','1',false)`);
    const first = (await db.query<{ id: string }>("select customer_portal_ops_upsert_org(null,'A',null,true) id")).rows[0].id;
    const second = (await db.query<{ id: string }>("select customer_portal_ops_upsert_org(null,'B',null,true) id")).rows[0].id;
    await db.query("select customer_portal_ops_assign_admin($1,'admin@example.com')", [first]);
    await expect(db.query("select customer_portal_ops_assign_admin($1,'admin@example.com')", [second]))
      .rejects.toThrow("membership_conflict");
  });
});
