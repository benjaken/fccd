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
},20000);
afterEach(async()=>{await db.close();});
function order(request=ids.request,points=0){return db.query<{id:string}>(`select customer_portal_submit_order($1,$2,$3,$4::jsonb,$5) as id`,[request,ids.menu,ids.address,JSON.stringify([{product_id:ids.product,quantity:1}]),points]);}
describe("customer portal SQL transactions",()=>{
  it("rejects nonmembers and never trusts a supplied organization",async()=>{
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    await expect(order()).rejects.toThrow("customer_membership_required");
    await expect(db.query("select customer_portal_snapshot()")).rejects.toThrow("customer_membership_required");
  });
  it("deduplicates retries without taking stock twice",async()=>{
    const a=await order();const b=await order();expect(a.rows[0].id).toBe(b.rows[0].id);
    const q=await db.query<{quantity:number}>("select available_quantity as quantity from customer_menu_items");expect(q.rows[0].quantity).toBe(9);
    const n=await db.query<{n:number}>("select count(*)::int n from orders");expect(n.rows[0].n).toBe(1);
  });
  it("rejects unavailable stock and expired menus",async()=>{
    await db.exec("update customer_menu_items set available_quantity=0");await expect(order()).rejects.toThrow("cart_unavailable");
    await db.exec("update customer_menu_assignments set cutoff_at=now()-interval '1 minute'");await expect(order()).rejects.toThrow("menu_unavailable");
  });
  it("deducts shared points atomically and prevents a second overspend",async()=>{
    await db.exec(`insert into customer_reward_entries(organization_id,points,remaining_points,kind,event_key,expires_at)
      values('${ids.org}',10000,10000,'earn','seed',now()+interval '1 year')`);
    await order(ids.request,10000);expect((await db.query<{balance:number}>(`select private.customer_reward_balance('${ids.org}') balance`)).rows[0].balance).toBe(0);
    await expect(order("00000000-0000-0000-0000-000000000009",10)).rejects.toThrow("insufficient_points");
    expect((await db.query<{n:number}>("select count(*)::int n from orders")).rows[0].n).toBe(1);
  });
  it("expires unused lots and excludes them from redemption",async()=>{
    await db.exec(`insert into customer_reward_entries(organization_id,points,remaining_points,kind,event_key,expires_at)
      values('${ids.org}',10000,10000,'earn','old',now()-interval '1 day')`);
    await expect(order(ids.request,10)).rejects.toThrow("insufficient_points");
  });
  it("requires completion and rewards a completed order once",async()=>{
    const {rows}=await order();const id=rows[0].id;
    await expect(db.query("select customer_portal_award_completed_order($1)",[id])).rejects.toThrow("order_not_completed");
    await db.query("update orders set delivery_status='已送達' where id=$1",[id]);
    await db.query("select customer_portal_award_completed_order($1)",[id]);await db.query("select customer_portal_award_completed_order($1)",[id]);
    const q=await db.query<{points:number;n:number}>("select sum(points)::int points,count(*)::int n from customer_reward_entries where kind='earn'");
    expect(q.rows[0]).toEqual({points:10000,n:1});
  });
  it("does not remove the last admin and requires matching email for invitations",async()=>{
    await expect(db.query("select customer_portal_remove_member($1)",[ids.user])).rejects.toThrow("last_admin_required");
    const {rows}=await db.query<{token:string}>("select customer_portal_invite('member@example.com') token");
    await expect(db.query("select customer_portal_accept_invite($1)",[rows[0].token])).rejects.toThrow("invalid_invitation");
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    await db.query("select customer_portal_accept_invite($1)",[rows[0].token]);
    await expect(db.query("select customer_portal_accept_invite($1)",[rows[0].token])).rejects.toThrow("invalid_invitation");
  });
  it("supports admin handover and pending invitation revoke",async()=>{
    await expect(db.query("select customer_portal_set_member_role($1,'member')",[ids.user])).rejects.toThrow("last_admin_required");
    const {rows}=await db.query<{token:string}>("select customer_portal_invite('member@example.com') token");
    const pending=await db.query<{s:{invitations:Array<{id:string;email:string}>}}>("select customer_portal_snapshot() s");
    expect(pending.rows[0].s.invitations).toEqual([expect.objectContaining({email:"member@example.com"})]);
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    await db.query("select customer_portal_accept_invite($1)",[rows[0].token]);
    await db.exec(`select set_config('test.user_id','${ids.user}',false)`);
    await db.query("select customer_portal_set_member_role($1,'admin')",[ids.other]);
    await db.query("select customer_portal_set_member_role($1,'member')",[ids.user]);
    const roles=await db.query<{user_id:string;role:string}>(
      "select user_id,role from customer_memberships where organization_id=$1 and is_active order by role,user_id",[ids.org]);
    expect(roles.rows).toEqual([
      {user_id:ids.other,role:"admin"},
      {user_id:ids.user,role:"member"},
    ]);
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    const again=await db.query<{token:string}>("select customer_portal_invite('second@example.com') token");
    const listed=await db.query<{s:{invitations:Array<{id:string}>}}>("select customer_portal_snapshot() s");
    const secondId=listed.rows[0].s.invitations[0].id;
    await db.query("select customer_portal_revoke_invitation($1)",[secondId]);
    expect((await db.query<{s:{invitations:unknown[]}}>("select customer_portal_snapshot() s")).rows[0].s.invitations).toEqual([]);
    await db.exec(`insert into auth.users values('00000000-0000-0000-0000-000000000099','second@example.com',now())`);
    await db.exec(`select set_config('test.user_id','00000000-0000-0000-0000-000000000099',false)`);
    await expect(db.query("select customer_portal_accept_invite($1)",[again.rows[0].token])).rejects.toThrow("invalid_invitation");
    await expect(db.query("select customer_portal_revoke_invitation($1)",[secondId])).rejects.toThrow("customer_membership_required");
  });
  it("keeps uploaded evidence pending and creates exactly one payment on review",async()=>{
    const id=(await order()).rows[0].id;const path=`${ids.user}/${id}/receipt.pdf`;
    await db.query("insert into storage.objects(bucket_id,name) values('customer-payment-evidence',$1)",[path]);
    await db.query("select customer_portal_submit_evidence($1,$2,100)",[id,path]);
    await expect(db.query("select customer_portal_financial_document($1,'receipt')",[id])).rejects.toThrow("payment_not_verified");
    expect((await db.query<{n:number}>("select count(*)::int n from payments")).rows[0].n).toBe(0);
    const e=(await db.query<{id:string}>("select id from customer_payment_evidence")).rows[0].id;
    const method="00000000-0000-0000-0000-000000000010";
    await db.query("insert into payment_methods(id,legacy_id,name) values($1,'bank','Bank')",[method]);
    await db.query("select customer_portal_review_evidence($1,true,null,$2,$3)",[e,method,ids.user]);
    await db.query("select customer_portal_review_evidence($1,true,null,$2,$3)",[e,method,ids.user]);
    expect((await db.query<{n:number}>("select count(*)::int n from payments")).rows[0].n).toBe(1);
    expect((await db.query<{n:number}>("select outstanding::int n from orders where id=$1",[id])).rows[0].n).toBe(0);
    for(const kind of ["receipt","invoice"]){
      const document=await db.query<{d:{paid:boolean}}>("select customer_portal_financial_document($1,$2) d",[id,kind]);
      expect(document.rows[0].d.paid).toBe(true);
    }
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    await expect(db.query("select customer_portal_financial_document($1,'invoice')",[id])).rejects.toThrow("customer_membership_required");
  });
  it("rejects an evidence path from another account",async()=>{
    const id=(await order()).rows[0].id;
    await expect(db.query("select customer_portal_submit_evidence($1,$2,100)",[id,`${ids.other}/${id}/receipt.pdf`])).rejects.toThrow("invalid_payment_evidence");
  });
  it("does not treat an organization admin as a finance reviewer",async()=>{
    await expect(db.query("select customer_portal_review_queue()")).rejects.toThrow("finance_access_required");
    await db.exec(`insert into user_profiles(id,role) values('${ids.user}','Accounting')`);
    expect((await db.query<{q:{evidence:unknown[]}}>("select customer_portal_review_queue() q")).rows[0].q.evidence).toEqual([]);
  });
  it("limits member menus by assigned scopes and rejects off-scope orders",async()=>{
    const invite=(await db.query<{token:string}>("select customer_portal_invite('member@example.com') token")).rows[0].token;
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    await db.query("select customer_portal_accept_invite($1)",[invite]);
    await db.exec(`select set_config('test.user_id','${ids.user}',false)`);
    await db.query("select customer_portal_set_member_menu_scopes($1,$2::uuid[])",[ids.other,[ids.menu]]);
    const hidden="00000000-0000-0000-0000-0000000000aa";
    await db.exec(`insert into customer_menu_assignments(id,organization_id,channel_id,name,delivery_date,delivery_time,cutoff_at)
      values('${hidden}','${ids.org}','${ids.brand}','Hidden',current_date+3,'12:00',now()+interval '2 day')`);
    await db.exec(`insert into customer_menu_items(menu_id,product_id,unit_price,available_quantity) values('${hidden}','${ids.product}',100,5)`);
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    const snap=await db.query<{s:{menus:Array<{id:string}>}}>("select customer_portal_snapshot() s");
    expect(snap.rows[0].s.menus.map(m=>m.id)).toEqual([ids.menu]);
    await expect(db.query(`select customer_portal_submit_order($1,$2,$3,$4::jsonb,0)`,[
      "00000000-0000-0000-0000-0000000000bb",hidden,ids.address,JSON.stringify([{product_id:ids.product,quantity:1}]),
    ])).rejects.toThrow("menu_unavailable");
    await order("00000000-0000-0000-0000-0000000000cc");
    await db.exec(`select set_config('test.user_id','${ids.user}',false)`);
    await db.query("select customer_portal_set_member_menu_scopes($1,$2::uuid[])",[ids.other,[]]);
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    expect((await db.query<{s:{menus:Array<{id:string}>}}>("select customer_portal_snapshot() s")).rows[0].s.menus.map(m=>m.id).sort())
      .toEqual([ids.menu,hidden].sort());
  });
  it("saves applies and archives shared order templates",async()=>{
    const id=(await db.query<{id:string}>("select customer_portal_save_template('Weekly',$1::jsonb) id",[JSON.stringify([{product_id:ids.product,quantity:2}])])).rows[0].id;
    const snap=await db.query<{s:{templates:Array<{id:string;name:string;items:Array<{product_id:string;quantity:number}>}>}}>("select customer_portal_snapshot() s");
    expect(snap.rows[0].s.templates[0]).toMatchObject({id,name:"Weekly",items:[{product_id:ids.product,quantity:2}]});
    await db.query("select customer_portal_update_template($1,'Weekly plus',$2::jsonb)",[id,JSON.stringify([{product_id:ids.product,quantity:3}])]);
    await db.query("select customer_portal_archive_template($1)",[id]);
    expect((await db.query<{s:{templates:unknown[]}}>("select customer_portal_snapshot() s")).rows[0].s.templates).toEqual([]);
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    await expect(db.query("select customer_portal_save_template('X',$1::jsonb)",[JSON.stringify([{product_id:ids.product,quantity:1}])])).rejects.toThrow("customer_membership_required");
  });
  it("updates and archives organization addresses without exposing them to nonmembers",async()=>{
    await db.query("select customer_portal_update_address($1,'Warehouse','Lee','91234568','Kowloon warehouse')",[ids.address]);
    const updated=await db.query<{label:string;recipient:string;phone:string;address:string}>(
      "select label,recipient,phone,address from customer_addresses where id=$1",[ids.address]);
    expect(updated.rows[0]).toEqual({label:"Warehouse",recipient:"Lee",phone:"91234568",address:"Kowloon warehouse"});
    await db.query("select customer_portal_archive_address($1)",[ids.address]);
    const snap=await db.query<{s:{addresses:unknown[]}}>("select customer_portal_snapshot() s");
    expect(snap.rows[0].s.addresses).toEqual([]);
    await expect(order("00000000-0000-0000-0000-000000000011")).rejects.toThrow("address_required");
    await expect(db.query("select customer_portal_update_address($1,'X','Y','91234567','Still here')",[ids.address])).rejects.toThrow("address_required");
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    await expect(db.query("select customer_portal_archive_address($1)",[ids.address])).rejects.toThrow("customer_membership_required");
  });
});
