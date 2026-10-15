import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let db:PGlite;
const ids={user:"00000000-0000-0000-0000-000000000001",other:"00000000-0000-0000-0000-000000000002",org:"00000000-0000-0000-0000-000000000003",brand:"00000000-0000-0000-0000-000000000004",product:"00000000-0000-0000-0000-000000000005",menu:"00000000-0000-0000-0000-000000000006",address:"00000000-0000-0000-0000-000000000007",request:"00000000-0000-0000-0000-000000000008"};
const migration=readFileSync("supabase/migrations/20261012090000_customer_organization_portal.sql","utf8");
beforeEach(async()=>{
  db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create schema private;create schema extensions;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user_id',true),'')::uuid$$;
    create function extensions.gen_random_bytes(integer) returns bytea language sql as $$select decode(replace(gen_random_uuid()::text,'-',''),'hex')$$;
    create function extensions.digest(text,text) returns bytea language sql as $$select decode(md5($1),'hex')$$;`);
  const core=readFileSync("supabase/migrations/20260812032618_create_core_catering_schema.sql","utf8");
  for(const table of ["channels","payment_methods","customers","products","orders","order_lines","payments"]){
    const definition=core.match(new RegExp(`create table public\\.${table} \\([\\s\\S]*?\\n\\);`))![0];
    // Related tables are not needed for these transaction tests.
    await db.exec(definition.replace(/references public\.\w+ \(id\)/g,""));
  }
  await db.exec(`alter table orders add column source_system text;alter table orders add column delivery_time text;`);
  await db.exec(migration);
  await db.exec(`create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function private.recalculate_quote_total(uuid) returns void language sql as $$
      update orders set outstanding=grand_total-coalesce((select sum(amount) from payments where order_id=$1 and voided_at is null),0) where id=$1$$;`);
  await db.exec(readFileSync("supabase/migrations/20261012091000_customer_payment_evidence.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261012092000_customer_financial_documents.sql","utf8"));
  await db.exec("create table public.user_profiles(id uuid primary key,role text)");
  await db.exec(readFileSync("supabase/migrations/20261012093000_customer_finance_review_access.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261012140000_customer_portal_address_edit.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261012150000_customer_portal_team_handover.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261012160000_customer_portal_order_templates.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261012180000_customer_portal_member_menu_scopes.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261013150000_customer_reward_hkd_per_point.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261013160000_customer_portal_quotes.sql","utf8"));
  await db.exec(`select set_config('test.user_id','${ids.user}',false);
    insert into auth.users values('${ids.user}','admin@example.com',now()),('${ids.other}','member@example.com',now());
    insert into customer_organizations(id,name) values('${ids.org}','Org');
    insert into customer_memberships(user_id,organization_id,role) values('${ids.user}','${ids.org}','admin');
    insert into channels(id,legacy_id,name) values('${ids.brand}','brand','Catering');
    insert into products(id,legacy_id,channel_id,name,price) values('${ids.product}','product','${ids.brand}','Food',100);
    insert into customer_menu_assignments(id,organization_id,channel_id,name,delivery_date,delivery_time,cutoff_at)
      values('${ids.menu}','${ids.org}','${ids.brand}','Menu',current_date+2,'12:00',now()+interval '1 day');
    insert into customer_menu_items(menu_id,product_id,unit_price,available_quantity) values('${ids.menu}','${ids.product}',100,10);
    insert into customer_addresses(id,organization_id,label,recipient,phone,address,created_by)
      values('${ids.address}','${ids.org}','Office','Name','91234567','Office address','${ids.user}');`);
  await db.exec(`create table public.app_pages(page_key text primary key,display_name text,route text,sort_order int,is_high_risk boolean,parent_page_key text,page_kind text,updated_at timestamptz default now());
    create table public.role_page_permissions(role text,page_key text,can_access boolean,can_manage boolean,updated_at timestamptz default now(),primary key(role,page_key));
    create function private.has_page_access(text) returns boolean language sql as $$select true$$;
    create function private.has_page_manage(text) returns boolean language sql as $$select true$$;
    create function private.customer_personal_user() returns uuid language sql as $$select auth.uid()$$;
    create table shopify_stores(id uuid primary key,shop_domain text,secret_prefix text,is_active boolean default true);
    create table private.customer_personal_addresses(id uuid primary key,user_id uuid,label text,recipient text,phone text,address text,is_default boolean,created_at timestamptz default now(),updated_at timestamptz default now());`);
  for(const file of ["20261012170000_customer_portal_ops_admin.sql","20261013090000_customer_organization_applications.sql","20261014090000_customer_reward_catalog.sql","20261014103000_shopify_voucher_and_address_sync.sql","20261014110000_customer_multi_organization.sql","20261014120000_customer_org_permissions.sql","20261014180000_customer_portal_review_permissions.sql","20261014181000_customer_reward_redemption_pages.sql","20261014182000_shopify_voucher_worker_recovery.sql","20261014183000_customer_receipt_workspace_scope.sql"])
    await db.exec(readFileSync(`supabase/migrations/${file}`,"utf8"));
},20000);
afterEach(async()=>{await db.close();});
function order(request=ids.request,points=0){return db.query<{id:string}>(`select customer_portal_submit_order($1,$2,$3,$4::jsonb,$5) as id`,[request,ids.menu,ids.address,JSON.stringify([{product_id:ids.product,quantity:1}]),points]);}
describe("portal review regressions",()=>{
  it("keeps a tab's request on its displayed company after another tab switches",async()=>{
    const second="00000000-0000-0000-0000-000000000099";
    await db.query("insert into customer_organizations(id,name) values($1,'Second')",[second]);
    await db.query("insert into customer_memberships(user_id,organization_id,role) values($1,$2,'admin')",[ids.user,second]);
    await db.query("select customer_portal_select_organization($1)",[second]);
    await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({"x-customer-organization":ids.org})]);
    await db.query("select customer_portal_set_member_permission('ordering',false)");
    expect((await db.query<{organization_id:string}>("select organization_id from customer_org_member_permissions")).rows).toEqual([{organization_id:ids.org}]);
    await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({"x-customer-organization":"unavailable"})]);
    await expect(db.query("select customer_portal_set_member_permission('ordering',true)")).rejects.toThrow("customer_membership_required");
  });
  it("returns team data for delegated members and menu permissions",async()=>{
    await db.query("insert into customer_memberships(user_id,organization_id,role) values($1,$2,'member')",[ids.other,ids.org]);
    await db.query("select customer_portal_set_member_permission('members',true)");
    await db.query("select customer_portal_set_member_permission('menus',true)");
    await db.query("select set_config('test.user_id',$1,false)",[ids.other]);
    const data=(await db.query<{data:{members:unknown[];org_menus:unknown[]}}>("select customer_portal_workspace() data")).rows[0].data;
    expect(data.members).toHaveLength(2); expect(data.org_menus).toHaveLength(1);
  });
  it("authorizes an evidence upload by its order even after another tab changes selection",async()=>{
    const id=(await order()).rows[0].id;
    const second="00000000-0000-0000-0000-000000000099";
    await db.query("insert into customer_organizations(id,name) values($1,'Second')",[second]);
    await db.query("insert into customer_memberships(user_id,organization_id,role) values($1,$2,'admin')",[ids.user,second]);
    await db.query("select customer_portal_select_organization($1)",[second]);
    const path=`${ids.user}/${id}/receipt.pdf`;
    expect((await db.query<{allowed:boolean}>("select private.customer_receipt_path_allowed($1) allowed",[path])).rows[0].allowed).toBe(true);
    await db.query("update customer_memberships set is_active=false where user_id=$1 and organization_id=$2",[ids.user,ids.org]);
    expect((await db.query<{allowed:boolean}>("select private.customer_receipt_path_allowed($1) allowed",[path])).rows[0].allowed).toBe(false);
  });
  it("enforces order and export permission on the actual financial document RPC",async()=>{
    const id=(await order()).rows[0].id;
    await db.query("update orders set document_type='order',grand_total=0,outstanding=0 where id=$1",[id]);
    await db.query("insert into customer_memberships(user_id,organization_id,role) values($1,$2,'member')",[ids.other,ids.org]);
    await db.query("select customer_portal_set_member_permission('orders',false)");
    await db.query("select set_config('test.user_id',$1,false)",[ids.other]);
    await expect(db.query("select customer_portal_financial_document($1,'invoice')",[id])).rejects.toThrow("permission_denied");
    await db.query("select set_config('test.user_id',$1,false)",[ids.user]);
    expect((await db.query<{data:{id:string}}>("select customer_portal_financial_document($1,'invoice') data",[id])).rows[0].data.id).toBe(id);
  });
  it("keeps old pending redemptions reachable beyond the former 100-row limit",async()=>{
    const catalog=(await db.query<{id:string}>("insert into customer_reward_catalog(name,kind,points_cost,stock,is_active) values('Gift','gift',1,200,true) returning id")).rows[0].id;
    await db.query("insert into customer_reward_catalog_redemptions(catalog_id,organization_id,points,request_id,status,created_at) select $1,$2,1,gen_random_uuid(),'fulfilled',now() from generate_series(1,100)",[catalog,ids.org]);
    await db.query("insert into customer_reward_catalog_redemptions(catalog_id,organization_id,points,request_id,created_at) values($1,$2,1,gen_random_uuid(),now()-interval '1 day')",[catalog,ids.org]);
    const data=(await db.query<{data:{rows:Array<{status:string}>;total:number}}>("select customer_portal_ops_redemption_page(1) data")).rows[0].data;
    expect(data.total).toBe(101); expect(data.rows).toHaveLength(15); expect(data.rows[0].status).toBe("pending");
  });
  it("recovers a timed-out voucher while retaining its assigned code",async()=>{
    const store="00000000-0000-0000-0000-000000000098";
    await db.query("insert into shopify_stores(id,shop_domain,secret_prefix) values($1,'brand.myshopify.com','BRAND')",[store]);
    const catalog=(await db.query<{id:string}>("insert into customer_reward_catalog(name,kind,points_cost,stock,is_active,shopify_store_id,voucher_amount_hkd) values('Voucher','voucher',1,10,true,$1,100) returning id",[store])).rows[0].id;
    await db.query("insert into customer_reward_catalog_redemptions(catalog_id,organization_id,points,request_id) values($1,$2,1,gen_random_uuid())",[catalog,ids.org]);
    expect((await db.query<{jobs:unknown[]}>("select shopify_claim_voucher_jobs(null,20) jobs")).rows[0].jobs).toHaveLength(1);
    await db.query("update private.customer_shopify_vouchers set code='FCCDABCDEFGHJK',locked_at=now()-interval '11 minutes'");
    const jobs=(await db.query<{jobs:Array<{code:string}>}>("select shopify_claim_voucher_jobs(null,20) jobs")).rows[0].jobs;
    expect(jobs).toHaveLength(1); expect(jobs[0].code).toBe("FCCDABCDEFGHJK");
    expect((await db.query<{jobs:unknown[]}>("select shopify_claim_voucher_jobs(null,20) jobs")).rows[0].jobs).toHaveLength(0);
  });
});
