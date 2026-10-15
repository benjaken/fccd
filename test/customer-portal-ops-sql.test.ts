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
  await db.exec(`alter table orders add column source_system text;alter table orders add column delivery_time text;alter table orders add column if not exists source_quote_id uuid;`);
  await db.exec(readFileSync("supabase/migrations/20261012090000_customer_organization_portal.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261012170000_customer_portal_ops_admin.sql", "utf8"));
  const period = readFileSync("supabase/migrations/20261014200000_customer_menu_valid_period.sql", "utf8");
  await db.exec(period.split("\n-- ordering\n")[0]);
  await db.exec(readFileSync("supabase/migrations/20261014210000_customer_group_order_calendar.sql", "utf8").split("\n-- ordering\n")[0]);
  await db.exec(readFileSync("supabase/migrations/20261014213000_customer_portal_meal_calendar.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261014230000_customer_vip_calendar.sql", "utf8"));
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

  it("lists each group customer's meals on the Hong Kong service date", async () => {
    const orgId = (await db.query<{ id: string }>(
      "select customer_portal_ops_upsert_org(null,'恒隆集團',null,true,true) id",
    )).rows[0].id;
    const hiddenOrgId = (await db.query<{ id: string }>(
      "select customer_portal_ops_upsert_org(null,'普通公司',null,true,false) id",
    )).rows[0].id;
    const menuId = (await db.query<{ id: string }>(
      `select customer_portal_ops_upsert_menu(null,$1,$2,'Lunch',current_date,current_date,'12:00',now()+interval '1 day',0,true) id`,
      [orgId, ids.brand],
    )).rows[0].id;
    const ruleId = (await db.query<{ id: string }>("select id from customer_reward_rules limit 1")).rows[0].id;
    const quoteId = "00000000-0000-0000-0000-000000000091";
    const orderId = "00000000-0000-0000-0000-000000000092";
    const archivedId = "00000000-0000-0000-0000-000000000093";
    const plainId = "00000000-0000-0000-0000-000000000096";
    await db.exec(`
      insert into orders(id,legacy_id,channel_id,document_type,order_number,delivery_at,delivery_time,delivery_status,shipping_address_snapshot)
        values('${quoteId}','cal-quote','${ids.brand}','quote','Q-1','2026-10-16 04:00:00+00','11:00','未派車隊','舊地址'),
              ('${orderId}','cal-order','${ids.brand}','order','FC-9001','2026-10-16 04:00:00+00','12:00','未派車隊','中環'),
              ('${archivedId}','cal-archived','${ids.brand}','order','FC-HIDE','2026-10-16 04:00:00+00','12:00',null,'隱藏'),
              ('${plainId}','cal-plain','${ids.brand}','order','FC-PLAIN','2026-10-16 04:00:00+00','12:00',null,'普通地址');
      update orders set source_quote_id='${quoteId}' where id='${orderId}';
      update orders set archived_at=now() where id='${archivedId}';
      insert into order_lines(legacy_id,order_id,product_name_snapshot,quantity,is_void)
        values('line-old','${quoteId}','舊餐',9,false),
              ('line-meal','${orderId}','叉燒飯',2,false),
              ('line-soup','${orderId}','例湯',1,false),
              ('line-void','${orderId}','取消餐',4,true);
      insert into customer_portal_orders(order_id,organization_id,created_by,menu_id,request_id,reward_rule_id,food_amount)
        values('${quoteId}','${orgId}','${ids.user}','${menuId}','00000000-0000-0000-0000-000000000094','${ruleId}',200),
              ('${archivedId}','${orgId}','${ids.user}','${menuId}','00000000-0000-0000-0000-000000000095','${ruleId}',10),
              ('${plainId}','${hiddenOrgId}','${ids.user}','${menuId}','00000000-0000-0000-0000-000000000097','${ruleId}',10);
    `);
    const rows = (await db.query<{ calendar: Array<{ order_id: string; organization_name: string; service_date: string; lines: Array<{ name: string; quantity: number }> }> }>(
      "select customer_portal_ops_meal_calendar('2026-10-01','2026-10-31') calendar",
    )).rows[0].calendar;
    expect(rows.map((row) => row.organization_name)).toEqual(["恒隆集團"]);
    expect(rows).toEqual([expect.objectContaining({
      order_id: orderId,
      organization_name: "恒隆集團",
      order_number: "FC-9001",
      service_date: "2026-10-16",
      lines: expect.arrayContaining([
        { name: "叉燒飯", quantity: 2 },
        { name: "例湯", quantity: 1 },
      ]),
    })]);
    await expect(db.query("select customer_portal_ops_meal_calendar('2026-10-01','2026-12-01')"))
      .rejects.toThrow("invalid_range");
    await db.exec(`select set_config('test.has_access','0',false)`);
    await expect(db.query("select customer_portal_ops_meal_calendar('2026-10-01','2026-10-31')"))
      .rejects.toThrow("page_access_required");
  });

  it("lists open company menus for the month and stores a holiday closure", async () => {
    await db.exec(`select set_config('test.has_access','1',false)`);
    const orgId = (await db.query<{ id: string }>(
      "select customer_portal_ops_upsert_org(null,'日曆公司',null,true,true) id",
    )).rows[0].id;
    const hiddenOrgId = (await db.query<{ id: string }>(
      "select customer_portal_ops_upsert_org(null,'非VIP公司',null,true,false) id",
    )).rows[0].id;
    await db.query(
      `select customer_portal_ops_upsert_menu(null,$1,$2,'午市餐牌',current_date,current_date+6,'12:00',now()+interval '5 day',0,true)`,
      [orgId, ids.brand],
    );
    await db.query(
      `select customer_portal_ops_upsert_menu(null,$1,$2,'隱藏餐牌',current_date,current_date+6,'12:00',now()+interval '5 day',0,true)`,
      [hiddenOrgId, ids.brand],
    );
    const holiday = (await db.query<{ day: string }>("select (current_date+1)::text as day")).rows[0].day;
    await db.query("select customer_portal_ops_set_order_blackout($1::date,'國慶',false)", [holiday]);
    const calendar = (await db.query<{ d: { openings: Array<{ organization_name: string; menu_name: string }>; blackouts: Array<{ blackout_on: string; name: string }> } }>(
      "select customer_portal_ops_list_group_calendar(current_date, current_date+7) d",
    )).rows[0].d;
    expect(calendar.openings).toEqual([expect.objectContaining({ organization_name: "日曆公司", menu_name: "午市餐牌" })]);
    expect(calendar.blackouts).toEqual([expect.objectContaining({ blackout_on: holiday, name: "國慶" })]);
    await expect(db.query("select customer_portal_ops_set_order_blackout(current_date,'',false)")).rejects.toThrow("invalid_blackout");
  });
});
