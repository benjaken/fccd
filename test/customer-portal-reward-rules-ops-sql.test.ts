import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let db: PGlite;
const ids = {
  user: "00000000-0000-0000-0000-000000000001",
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
  await db.exec(readFileSync("supabase/migrations/20261012190000_customer_portal_reward_rules_ops.sql", "utf8"));
  await db.exec(`select set_config('test.user_id','${ids.user}',false);
    select set_config('test.has_access','1',false);
    insert into auth.users values('${ids.user}','admin@example.com',now());`);
}, 20000);

afterEach(async () => { await db.close(); });

describe("customer portal reward rules ops SQL", () => {
  it("lists seed rule and creates a new version", async () => {
    const listed = await db.query<{ d: Array<{ points_per_hkd: number; is_active: boolean }> }>(
      "select customer_portal_ops_list_reward_rules() d",
    );
    expect(listed.rows[0].d.length).toBeGreaterThanOrEqual(1);
    expect(listed.rows[0].d.some(row => row.is_active && Number(row.points_per_hkd) === 100)).toBe(true);

    const at = "2099-01-01T00:00:00+08:00";
    const id = (await db.query<{ id: string }>(
      "select customer_portal_ops_create_reward_rule(50,$1::timestamptz) id",
      [at],
    )).rows[0].id;
    expect(id).toBeTruthy();

    const again = await db.query<{ d: Array<{ id: string; points_per_hkd: number; is_active: boolean }> }>(
      "select customer_portal_ops_list_reward_rules() d",
    );
    const created = again.rows[0].d.find(row => row.id === id);
    expect(created).toEqual(expect.objectContaining({
      points_per_hkd: 50,
      is_active: false,
    }));
  });

  it("rejects ops without access, invalid rates and duplicate effective_at", async () => {
    await db.exec(`select set_config('test.has_access','0',false)`);
    await expect(db.query("select customer_portal_ops_list_reward_rules()"))
      .rejects.toThrow("page_access_required");
    await expect(db.query("select customer_portal_ops_create_reward_rule(10,now())"))
      .rejects.toThrow("page_access_required");

    await db.exec(`select set_config('test.has_access','1',false)`);
    await expect(db.query("select customer_portal_ops_create_reward_rule(-1,now())"))
      .rejects.toThrow("invalid_reward_rule");
    await expect(db.query("select customer_portal_ops_create_reward_rule(100001,now())"))
      .rejects.toThrow("invalid_reward_rule");

    const stamp = "2099-06-01T12:00:00+08:00";
    await db.query("select customer_portal_ops_create_reward_rule(25,$1::timestamptz)", [stamp]);
    await expect(db.query("select customer_portal_ops_create_reward_rule(30,$1::timestamptz)", [stamp]))
      .rejects.toThrow("duplicate_effective_at");
  });

  it("applies future earn rate only after effective_at and freezes R=0 pause", async () => {
    const future = (await db.query<{ t: string }>("select (now() + interval '1 day')::text t")).rows[0].t;
    await db.query("select customer_portal_ops_create_reward_rule(0,$1::timestamptz)", [future]);

    const activeNow = await db.query<{ rate: number }>(`
      select points_per_hkd::float rate from customer_reward_rules
      where effective_at <= now() order by effective_at desc limit 1`);
    expect(activeNow.rows[0].rate).toBe(100);

    await db.exec(`update customer_reward_rules set effective_at = now() - interval '2 days'
      where points_per_hkd = 100;
      update customer_reward_rules set effective_at = now() - interval '1 minute'
      where points_per_hkd = 0`);
    const activeLater = await db.query<{ rate: number }>(`
      select points_per_hkd::float rate from customer_reward_rules
      where effective_at <= now() order by effective_at desc limit 1`);
    expect(activeLater.rows[0].rate).toBe(0);
  });
});
