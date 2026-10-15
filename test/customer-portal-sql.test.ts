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
  const period = readFileSync("supabase/migrations/20261014200000_customer_menu_valid_period.sql", "utf8");
  await db.exec(period.split("\n-- workspace-overlay\n")[0]);
  await db.exec(readFileSync("supabase/migrations/20261014210000_customer_group_order_calendar.sql", "utf8"));
  // Permission helpers live in a later migration that this harness does not load.
  await db.exec(`create function private.customer_require_permission(text) returns void language sql as $$select null::void$$;
    create function private.customer_has_permission(text) returns boolean language sql as $$select true$$;
    create function private.customer_portal_ops_require(p_admin boolean default false) returns void language sql as $$select null::void$$;
    create function private.enqueue_customer_address_sync(p_owner_type text,p_owner_id uuid,p_address_id uuid,p_action text) returns void language sql as $$select null::void$$;`);
  await db.exec(readFileSync("supabase/migrations/20261015160000_customer_portal_member_order_isolation.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261015170000_customer_portal_price_visibility.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261015180000_customer_member_profiles.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261015190000_customer_member_requests.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261015200000_customer_ops_packing_list.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261015210000_customer_delivery_minimum.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261015220000_customer_request_change_menu.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261015230000_customer_portal_address_default.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261015240000_customer_delivery_points.sql","utf8"));
},20000);
afterEach(async()=>{await db.close();});
function order(request=ids.request,points=0){return db.query<{id:string}>(`select customer_portal_submit_order($1,$2,$3,$4::jsonb,$5) as id`,[request,ids.menu,ids.address,JSON.stringify([{product_id:ids.product,quantity:1}]),points]);}
function seededPoint(addressId=ids.address){return db.query<{id:string}>("select id from customer_delivery_points where address_id=$1 and archived_at is null order by created_at, id limit 1",[addressId]);}
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
  it("rejects using points to reduce the amount due",async()=>{
    await db.exec(`insert into customer_reward_entries(organization_id,points,remaining_points,kind,event_key,expires_at)
      values('${ids.org}',10000,10000,'earn','seed',now()+interval '1 year')`);
    await expect(order(ids.request,10000)).rejects.toThrow("points_not_redeemable");
    expect((await db.query<{balance:number}>(`select private.customer_reward_balance('${ids.org}') balance`)).rows[0].balance).toBe(10000);
    expect((await db.query<{n:number}>("select count(*)::int n from orders")).rows[0].n).toBe(0);
  });
  it("requires a confirmed order and rewards a completed order once",async()=>{
    const {rows}=await order();const id=rows[0].id;
    const created=await db.query<{document_type:string;legacy_id:string}>("select document_type,legacy_id from orders where id=$1",[id]);
    expect(created.rows[0]).toEqual({document_type:"quote",legacy_id:`web-quote-${id}`});
    await db.query("select customer_portal_award_completed_order($1)",[id]);
    expect((await db.query<{n:number}>("select count(*)::int n from customer_reward_entries where kind='earn'")).rows[0].n).toBe(0);
    await db.query("update orders set document_type='order', delivery_status='已送達' where id=$1",[id]);
    await db.query("select customer_portal_award_completed_order($1)",[id]);await db.query("select customer_portal_award_completed_order($1)",[id]);
    const q=await db.query<{points:number;n:number}>("select sum(points)::int points,count(*)::int n from customer_reward_entries where kind='earn'");
    expect(q.rows[0]).toEqual({points:4,n:1});
    const formal="00000000-0000-0000-0000-000000000099";
    await db.query("insert into orders(id,legacy_id,document_type,source_quote_id,channel_id) values($1,$2,'order',$3,$4)",[formal,`web-order-${formal}`,id,ids.brand]);
    expect((await db.query<{order_id:string}>("select order_id from customer_portal_orders")).rows[0].order_id).toBe(formal);
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
  it("accepts any day inside a menu period and rejects days outside it",async()=>{
    await db.exec("update customer_menu_assignments set valid_until=current_date+10");
    const day=(await db.query<{service_day:string}>("select (current_date+4)::text as service_day")).rows[0].service_day;
    const {rows}=await db.query<{id:string}>(
      `select customer_portal_submit_order($1,$2,$3,$4::jsonb,0,$5::date) as id`,
      ["00000000-0000-0000-0000-0000000000d1",ids.menu,ids.address,JSON.stringify([{product_id:ids.product,quantity:1}]),day],
    );
    const saved=await db.query<{service_day:string}>("select (delivery_at at time zone 'Asia/Hong_Kong')::date::text as service_day from orders where id=$1",[rows[0].id]);
    expect(saved.rows[0].service_day).toBe(day);
    await expect(db.query(
      `select customer_portal_submit_order($1,$2,$3,$4::jsonb,0,(current_date+11)::date)`,
      ["00000000-0000-0000-0000-0000000000d2",ids.menu,ids.address,JSON.stringify([{product_id:ids.product,quantity:1}])],
    )).rejects.toThrow("delivery_date_unavailable");
    await db.exec("update customer_menu_assignments set delivery_date=current_date-3, valid_until=current_date-1");
    await expect(db.query(
      `select customer_portal_submit_order($1,$2,$3,$4::jsonb,0,current_date)`,
      ["00000000-0000-0000-0000-0000000000d3",ids.menu,ids.address,JSON.stringify([{product_id:ids.product,quantity:1}])],
    )).rejects.toThrow("menu_unavailable");
  });
  it("refuses an order on a holiday even when the menu covers that day", async () => {
    await db.exec("update customer_menu_assignments set valid_until=current_date+10");
    const day = (await db.query<{ service_day: string }>("select (current_date+4)::text as service_day")).rows[0].service_day;
    await db.query("insert into customer_order_blackouts(blackout_on, name) values($1,'補假')", [day]);
    await expect(db.query(
      `select customer_portal_submit_order($1,$2,$3,$4::jsonb,0,$5::date)`,
      ["00000000-0000-0000-0000-0000000000e1", ids.menu, ids.address, JSON.stringify([{ product_id: ids.product, quantity: 1 }]), day],
    )).rejects.toThrow("order_blackout");
    expect((await db.query<{ n: number }>("select count(*)::int n from orders")).rows[0].n).toBe(0);
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
  it("isolates member order history, exports and documents from other members",async()=>{
    const adminOrder=(await order("00000000-0000-0000-0000-0000000000f1")).rows[0].id;
    const invite=(await db.query<{token:string}>("select customer_portal_invite('member@example.com') token")).rows[0].token;
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    await db.query("select customer_portal_accept_invite($1)",[invite]);
    const memberOrder=(await order("00000000-0000-0000-0000-0000000000f2")).rows[0].id;
    const memberSnapshot=await db.query<{s:{orders:Array<{id:string}>}}>("select customer_portal_snapshot() s");
    expect(memberSnapshot.rows[0].s.orders.map(o=>o.id)).toEqual([memberOrder]);
    const memberExport=(await db.query<{c:string}>("select customer_portal_export_orders() c")).rows[0].c;
    expect(memberExport.split("\n")).toHaveLength(2);
    await expect(db.query("select customer_portal_financial_document($1,'receipt')",[adminOrder])).rejects.toThrow("order_not_found");
    await expect(db.query("select customer_portal_request_cancel($1,'no')",[adminOrder])).rejects.toThrow("order_not_cancellable");
    await db.exec(`select set_config('test.user_id','${ids.user}',false)`);
    const adminSnapshot=await db.query<{s:{orders:Array<{id:string}>}}>("select customer_portal_snapshot() s");
    expect(adminSnapshot.rows[0].s.orders.map(o=>o.id).sort()).toEqual([adminOrder,memberOrder].sort());
    expect((await db.query<{c:string}>("select customer_portal_export_orders() c")).rows[0].c.split("\n")).toHaveLength(3);
  });
  it("hides amounts from members when the company disables prices",async()=>{
    const adminOrder=(await order("00000000-0000-0000-0000-0000000000c1")).rows[0].id;
    const invite=(await db.query<{token:string}>("select customer_portal_invite('member@example.com') token")).rows[0].token;
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    await db.query("select customer_portal_accept_invite($1)",[invite]);
    const memberOrder=(await order("00000000-0000-0000-0000-0000000000c2")).rows[0].id;
    await db.exec(`select set_config('test.user_id','${ids.user}',false)`);
    await db.exec(`update customer_organizations set show_prices=false where id='${ids.org}'`);
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    const snap=await db.query<{s:{show_prices:boolean;menus:Array<{shipping_fee:number|null;items:Array<{unit_price:number|null}>}>;orders:Array<{total:number|null;outstanding:number|null;lines:Array<{unit_price:number|null}>}>}}>(
      "select customer_portal_snapshot() s");
    expect(snap.rows[0].s.show_prices).toBe(false);
    expect(snap.rows[0].s.menus[0].shipping_fee).toBeNull();
    expect(snap.rows[0].s.menus[0].items[0].unit_price).toBeNull();
    expect(snap.rows[0].s.orders[0].total).toBeNull();
    expect(snap.rows[0].s.orders[0].lines[0].unit_price).toBeNull();
    const csv=(await db.query<{c:string}>("select customer_portal_export_orders() c")).rows[0].c;
    expect(csv.split("\n")[1].endsWith(",")).toBe(true);
    await expect(db.query("select customer_portal_financial_document($1,'receipt')",[memberOrder])).rejects.toThrow("permission_denied");
    await db.exec(`select set_config('test.user_id','${ids.user}',false)`);
    const admin=await db.query<{s:{show_prices:boolean;orders:Array<{id:string;total:number|null}>}}>("select customer_portal_snapshot() s");
    expect(admin.rows[0].s.show_prices).toBe(true);
    expect(admin.rows[0].s.orders.find(o=>o.id===adminOrder)?.total).not.toBeNull();
  });
  it("assigns a member department, delivery point and ordering switch",async()=>{
    const invite=(await db.query<{token:string}>("select customer_portal_invite('member@example.com') token")).rows[0].token;
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    await db.query("select customer_portal_accept_invite($1)",[invite]);
    await db.exec(`select set_config('test.user_id','${ids.user}',false)`);
    const point=(await seededPoint()).rows[0].id;
    await db.query("select customer_portal_set_member_profile($1,$2,$3,$4)",[ids.other,'Kitchen',point,false]);
    const snap=await db.query<{s:{members:Array<{user_id:string;department:string;delivery_point_id:string;can_order:boolean}>}}>("select customer_portal_snapshot() s");
    expect(snap.rows[0].s.members.find(x=>x.user_id===ids.other)).toMatchObject({department:'Kitchen',delivery_point_id:point,can_order:false});
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    await expect(order("00000000-0000-0000-0000-0000000000a5")).rejects.toThrow("ordering_disabled");
    await db.exec(`select set_config('test.user_id','${ids.user}',false)`);
    await db.query("select customer_portal_set_member_profile($1,null,null,true)",[ids.other]);
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    await order("00000000-0000-0000-0000-0000000000a6");
    expect((await db.query<{s:{me:{department:string|null;can_order:boolean}}}>("select customer_portal_snapshot() s")).rows[0].s.me)
      .toMatchObject({department:null,can_order:true});
    await db.exec(`select set_config('test.user_id','${ids.user}',false)`);
    await expect(db.query("select customer_portal_set_member_profile($1,null,$2,true)",[ids.other,'00000000-0000-0000-0000-0000000000ff'])).rejects.toThrow("address_required");
  });
  it("seeds a delivery point for every address and manages several per address",async()=>{
    type Snap={s:{addresses:Array<{id:string;delivery_points:Array<{id:string;name:string}>}>;members:Array<{user_id:string;delivery_point_id:string|null}>}};
    const invite=(await db.query<{token:string}>("select customer_portal_invite('member@example.com') token")).rows[0].token;
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    await db.query("select customer_portal_accept_invite($1)",[invite]);
    await db.exec(`select set_config('test.user_id','${ids.user}',false)`);
    const seeded=(await seededPoint()).rows[0].id;
    const fresh=(await db.query<{id:string}>("insert into customer_addresses(organization_id,label,recipient,phone,address,created_by) values($1,'Warehouse','R','91234567','Somewhere',$2) returning id",[ids.org,ids.user])).rows[0].id;
    const freshPoints=await db.query<{name:string}>("select name from customer_delivery_points where address_id=$1",[fresh]);
    expect(freshPoints.rows.map(r=>r.name)).toEqual(["Warehouse"]);
    const point=(await db.query<{id:string}>("select customer_portal_save_delivery_point(null,$1,$2) id",[ids.address,"3/F"])).rows[0].id;
    await db.query("select customer_portal_set_member_profile($1,null,$2,true)",[ids.other,point]);
    const snap=await db.query<Snap>("select customer_portal_snapshot() s");
    const address=snap.rows[0].s.addresses.find(a=>a.id===ids.address)!;
    expect(address.delivery_points.map(p=>p.name).sort()).toEqual(["3/F","Office"]);
    expect(snap.rows[0].s.members.find(m=>m.user_id===ids.other)?.delivery_point_id).toBe(point);
    await db.query("select customer_portal_archive_delivery_point($1)",[point]);
    const after=await db.query<Snap>("select customer_portal_snapshot() s");
    const afterAddress=after.rows[0].s.addresses.find(a=>a.id===ids.address)!;
    expect(afterAddress.delivery_points.map(p=>p.id)).toEqual([seeded]);
    expect(after.rows[0].s.members.find(m=>m.user_id===ids.other)?.delivery_point_id).toBeNull();
  });
  it("keeps member submissions internal until an admin sends the batch",async()=>{
    const invite=(await db.query<{token:string}>("select customer_portal_invite('member@example.com') token")).rows[0].token;
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    await db.query("select customer_portal_accept_invite($1)",[invite]);
    const submit="select customer_portal_submit_member_request($1,$2,$3,$4,$5::jsonb) id";
    const args=["00000000-0000-0000-0000-0000000000b1",ids.menu,null,ids.address,JSON.stringify([{product_id:ids.product,quantity:2}])];
    const req=(await db.query<{id:string}>(submit,args)).rows[0].id;
    expect((await db.query<{n:number}>("select count(*)::int n from orders")).rows[0].n).toBe(0);
    expect((await db.query<{id:string}>(submit,args)).rows[0].id).toBe(req);
    const day=(await db.query<{d:string}>("select service_date::text d from customer_member_requests where id=$1",[req])).rows[0].d;
    await expect(db.query("select customer_portal_send_member_requests($1,$2,$3)",[ids.menu,day,"00000000-0000-0000-0000-0000000000b3"])).rejects.toThrow("permission_denied");
    await db.exec(`select set_config('test.user_id','${ids.user}',false)`);
    const first=(await db.query<{ids:string[]}>("select customer_portal_send_member_requests($1,$2,$3) ids",[ids.menu,day,"00000000-0000-0000-0000-0000000000b2"])).rows[0].ids;
    expect(first).toHaveLength(1);
    expect((await db.query<{n:number}>("select count(*)::int n from orders")).rows[0].n).toBe(1);
    expect((await db.query<{status:string;order_id:string}>("select status,order_id from customer_member_requests where id=$1",[req])).rows[0])
      .toEqual({status:"sent",order_id:first[0]});
    expect((await db.query<{n:number}>("select available_quantity::int n from customer_menu_items where product_id=$1",[ids.product])).rows[0].n).toBe(8);
    const again=(await db.query<{ids:string[]}>("select customer_portal_send_member_requests($1,$2,$3) ids",[ids.menu,day,"00000000-0000-0000-0000-0000000000b2"])).rows[0].ids;
    expect(again).toEqual(first);
    expect((await db.query<{n:number}>("select count(*)::int n from orders")).rows[0].n).toBe(1);
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    expect((await db.query<{s:{orders:Array<{id:string}>}}>("select customer_portal_snapshot() s")).rows[0].s.orders.map(o=>o.id)).toEqual([first[0]]);
  });
  it("lists pending submissions to the caller only",async()=>{
    const invite=(await db.query<{token:string}>("select customer_portal_invite('member@example.com') token")).rows[0].token;
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    await db.query("select customer_portal_accept_invite($1)",[invite]);
    await db.query("select customer_portal_submit_member_request($1,$2,$3,$4,$5::jsonb)",
      ["00000000-0000-0000-0000-0000000000c1",ids.menu,null,ids.address,JSON.stringify([{product_id:ids.product,quantity:1}])]);
    const memberList=await db.query<{r:Array<{member_id:string}>}>("select customer_portal_member_requests() r");
    expect(memberList.rows[0].r.map(x=>x.member_id)).toEqual([ids.other]);
    await db.exec(`select set_config('test.user_id','${ids.user}',false)`);
    expect((await db.query<{r:Array<{member_id:string}>}>("select customer_portal_member_requests() r")).rows[0].r.map(x=>x.member_id)).toEqual([ids.other]);
  });
  it("summarises a sent batch for packing by delivery point",async()=>{
    const invite=(await db.query<{token:string}>("select customer_portal_invite('member@example.com') token")).rows[0].token;
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    await db.query("select customer_portal_accept_invite($1)",[invite]);
    await db.query("select customer_portal_set_member_profile($1,$2,$3,$4)",[ids.other,'Kitchen',(await seededPoint()).rows[0].id,true]);
    await db.query("select customer_portal_submit_member_request($1,$2,$3,$4,$5::jsonb)",
      ["00000000-0000-0000-0000-0000000000e1",ids.menu,null,ids.address,JSON.stringify([{product_id:ids.product,quantity:2}])]);
    const day=(await db.query<{d:string}>("select service_date::text d from customer_member_requests where organization_id=$1",[ids.org])).rows[0].d;
    await db.exec(`select set_config('test.user_id','${ids.user}',false)`);
    await db.query("select customer_portal_send_member_requests($1,$2,$3)",[ids.menu,day,"00000000-0000-0000-0000-0000000000e2"]);
    const list=await db.query<{p:{days:Array<{address_id:string;total_quantity:number;lines:Array<{member_email:string;department:string;items:Array<{quantity:number}>}>}>}}>(
      "select customer_portal_ops_packing_list($1::date,$2::date) p",[day,day]);
    const d=list.rows[0].p.days[0];
    expect(d.address_id).toBe(ids.address);
    expect(Number(d.total_quantity)).toBe(2);
    expect(d.lines[0].member_email).toBe("member@example.com");
    expect(d.lines[0].department).toBe("Kitchen");
    expect(d.lines[0].items[0].quantity).toBe(2);
  });
  it("blocks a batch when a delivery point is below the minimum order quantity",async()=>{
    const invite=(await db.query<{token:string}>("select customer_portal_invite('member@example.com') token")).rows[0].token;
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    await db.query("select customer_portal_accept_invite($1)",[invite]);
    await db.query("select customer_portal_submit_member_request($1,$2,$3,$4,$5::jsonb)",
      ["00000000-0000-0000-0000-0000000000f1",ids.menu,null,ids.address,JSON.stringify([{product_id:ids.product,quantity:2}])]);
    const day=(await db.query<{d:string}>("select service_date::text d from customer_member_requests where organization_id=$1",[ids.org])).rows[0].d;
    await db.exec(`select set_config('test.user_id','${ids.user}',false)`);
    await db.exec(`update customer_menu_assignments set minimum_quantity=5 where id='${ids.menu}'`);
    await expect(db.query("select customer_portal_send_member_requests($1,$2,$3)",[ids.menu,day,"00000000-0000-0000-0000-0000000000f3"])).rejects.toThrow("minimum_not_met");
    expect((await db.query<{n:number}>("select count(*)::int n from orders")).rows[0].n).toBe(0);
    await db.exec(`update customer_menu_assignments set minimum_quantity=0 where id='${ids.menu}'`);
    await db.query("select customer_portal_send_member_requests($1,$2,$3)",[ids.menu,day,"00000000-0000-0000-0000-0000000000f4"]);
    expect((await db.query<{n:number}>("select count(*)::int n from orders")).rows[0].n).toBe(1);
  });
  it("lets an admin change the meal menu of a submitted request",async()=>{
    const alt="00000000-0000-0000-0000-0000000000a9";
    await db.exec(`insert into customer_menu_assignments(id,organization_id,channel_id,name,delivery_date,cutoff_at,delivery_time) values('${alt}','${ids.org}','${ids.brand}','Alt menu',current_date+2,now()+interval '1 day','12:00')`);
    await db.exec(`insert into customer_menu_items(menu_id,product_id,unit_price,available_quantity) values('${alt}','${ids.product}',20,10)`);
    const invite=(await db.query<{token:string}>("select customer_portal_invite('member@example.com') token")).rows[0].token;
    await db.exec(`select set_config('test.user_id','${ids.other}',false)`);
    await db.query("select customer_portal_accept_invite($1)",[invite]);
    const req=(await db.query<{id:string}>("select customer_portal_submit_member_request($1,$2,$3,$4,$5::jsonb) id",
      ["00000000-0000-0000-0000-0000000000b1",ids.menu,null,ids.address,JSON.stringify([{product_id:ids.product,quantity:1}])])).rows[0].id;
    await expect(db.query("select customer_portal_update_member_request($1,$2::jsonb,$3,$4,$5)",
      [req,JSON.stringify([{product_id:ids.product,quantity:3}]),"2099-01-01",ids.address,alt])).rejects.toThrow("permission_denied");
    await db.exec(`select set_config('test.user_id','${ids.user}',false)`);
    const day=(await db.query<{d:string}>("select (current_date+2)::text d")).rows[0].d;
    await db.query("select customer_portal_update_member_request($1,$2::jsonb,$3,$4,$5)",
      [req,JSON.stringify([{product_id:ids.product,quantity:3}]),day,ids.address,alt]);
    const row=(await db.query<{menu_id:string;food_amount:number;status:string}>("select menu_id,food_amount,status from customer_member_requests where id=$1",[req])).rows[0];
    expect(row.menu_id).toBe(alt);
    expect(Number(row.food_amount)).toBe(60);
    expect(row.status).toBe("submitted");
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
  it("keeps exactly one default organization address across save and archive",async()=>{
    type Snap={s:{addresses:Array<{id:string;is_default:boolean}>}};
    let snap=await db.query<Snap>("select customer_portal_snapshot() s");
    expect(snap.rows[0].s.addresses).toEqual([expect.objectContaining({id:ids.address,is_default:true})]);
    const saved=await db.query<{id:string}>("select customer_portal_save_address($1,$2,$3,$4,$5) id",["Warehouse","Lee","91234568","Kowloon warehouse",true]);
    snap=await db.query<Snap>("select customer_portal_snapshot() s");
    expect(snap.rows[0].s.addresses.filter(a=>a.is_default).map(a=>a.id)).toEqual([saved.rows[0].id]);
    await db.query("select customer_portal_archive_address($1)",[saved.rows[0].id]);
    snap=await db.query<Snap>("select customer_portal_snapshot() s");
    expect(snap.rows[0].s.addresses).toEqual([expect.objectContaining({id:ids.address,is_default:true})]);
  });
});
