import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
let db: PGlite;
const user = "00000000-0000-0000-0000-000000000001", other = "00000000-0000-0000-0000-000000000002", order = "00000000-0000-0000-0000-000000000003", product = "00000000-0000-0000-0000-000000000004", brand = "00000000-0000-0000-0000-000000000005", store = "00000000-0000-0000-0000-000000000006", draft = "00000000-0000-0000-0000-000000000007";
beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema private; create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user_id',true),'')::uuid$$;
    create table orders(id uuid primary key,channel_id uuid,shopify_store_id uuid,document_type text,archived_at timestamptz,order_number text,outstanding numeric,delivery_status text,currency text default 'HKD',email_snapshot text);
    create table private.customer_personal_order_links(order_id uuid primary key,user_id uuid);
    create table private.customer_self_service_sessions(auth_user_id uuid,expires_at timestamptz,phone_hash bytea,email_hash bytea);
    create function private.self_service_order_matches(p_order orders,p_phone bytea,p_email bytea) returns boolean language sql as $$
      select exists(select 1 from private.customer_personal_order_links where order_id=p_order.id and user_id=auth.uid())
        or (p_phone=decode('01','hex') and p_email=decode('02','hex'))$$;
    create table order_lines(id uuid primary key default gen_random_uuid(),order_id uuid,product_id uuid,package_id uuid,quantity numeric,is_void boolean default false,item_order numeric,remarks_1 text,remarks_2 text);
    create table customer_organizations(id uuid primary key,name text);
    create table customer_portal_orders(order_id uuid,organization_id uuid);
    create function private.customer_organization() returns uuid language plpgsql as $$begin raise exception 'customer_membership_required' using errcode='42501'; end$$;
    create table payment_methods(id uuid primary key,name text,is_active boolean,archived_at timestamptz);
    create table user_profiles(id uuid primary key,role text,email text,email_noti boolean);
    create function private.customer_portal_is_finance() returns boolean language sql as $$select exists(select 1 from user_profiles where id=auth.uid() and role='Accounting')$$;
    create table customer_payment_evidence(id uuid primary key default gen_random_uuid(),order_id uuid references orders(id),organization_id uuid not null,created_by uuid,object_path text unique,amount numeric,status text default 'pending',review_reason text,created_at timestamptz default now());
    create table storage.objects(bucket_id text,name text); alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated; grant select,insert on storage.objects to authenticated;
  `);
  await db.exec(`create table channels(id uuid primary key,name text);
    create table shopify_stores(id uuid primary key,channel_id uuid,shop_domain text,is_active boolean);
    create table shopify_catalog_mappings(store_id uuid,shopify_product_id bigint,shopify_variant_id bigint,internal_product_id uuid,resource_type text);
    create table shopify_catalog_drafts(id uuid primary key,store_id uuid,shopify_product_id bigint,shopify_status text,approval_status text,catalog_type text);
    create table shopify_catalog_draft_variants(draft_id uuid,shopify_variant_id bigint,requires_components boolean);`);
  await db.exec(readFileSync("supabase/migrations/20261013130000_customer_personal_workspace.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261014133000_customer_receipt_membership_guard.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261015140000_customer_personal_brand_website.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261015200000_customer_personal_order_scan_perf.sql", "utf8"));
  await db.exec(`create policy "Organization uploads" on storage.objects for insert to authenticated with check(private.customer_receipt_path_allowed(name));
    grant execute on function private.customer_receipt_path_allowed(text) to authenticated;
    insert into auth.users values('${user}','person@example.com',now()),('${other}','other@example.com',now());
    insert into orders(id,channel_id,document_type,order_number,outstanding) values('${order}','${brand}','order','FCC-100',100);
    insert into private.customer_personal_order_links values('${order}','${user}');
    insert into user_profiles values('${other}','Accounting','finance@example.com',true);
    insert into channels values('${brand}','Catering');insert into shopify_stores values('${store}','${brand}','catering.myshopify.com',true);
    select set_config('test.user_id','${user}',false);`);
}, 20000);
afterEach(async () => { await db.close(); });
async function snapshot() { return (await db.query<{ data: { profile: { phone: string; name: string }; addresses: Array<{ id: string; is_default: boolean }>; evidence: unknown[]; stores: unknown[] } }>("select customer_personal_snapshot() data")).rows[0].data; }
const address = { label: "Home", recipient: "Name", phone: "91234567", address: "Hong Kong", is_default: false };
async function saveAddress(id: string | null = null, isDefault = false) { return (await db.query<{ id: string }>("select customer_personal_save_address($1,$2::jsonb) id", [id, JSON.stringify({ ...address, is_default: isDefault })])).rows[0].id; }
describe("personal workspace authorization and transactions", () => {
  it("treats the multi-organization membership error as a denied organization Storage policy", async () => {
    await db.exec(`create or replace function private.customer_organization() returns uuid language plpgsql as $$
      begin raise exception 'customer_membership_required' using errcode='P0001'; end$$;`);
    expect((await db.query<{allowed:boolean}>("select private.customer_receipt_path_allowed($1) allowed",[`${user}/${order}/scan.pdf`])).rows[0].allowed).toBe(false);
    await db.exec(`set role authenticated`);
    await db.query("insert into storage.objects(bucket_id,name) values('customer-payment-evidence',$1)", [`${user}/${order}/00000000-0000-0000-0000-000000000009.pdf`]);
    await db.exec("reset role");
  });
  it("reuses only the current user's unexpired parent-order capability without a new phone step", async () => {
    await db.exec(`delete from private.customer_personal_order_links;
      insert into private.customer_self_service_sessions values('${other}',now()+interval '1 hour',decode('01','hex'),decode('02','hex'));`);
    const allowed = async () => (await db.query<{ allowed: boolean }>("select private.customer_personal_owns_order($1) allowed", [order])).rows[0].allowed;
    expect(await allowed()).toBe(false);
    await db.exec(`insert into private.customer_self_service_sessions values('${user}',now()-interval '1 hour',decode('01','hex'),decode('02','hex'));`);
    expect(await allowed()).toBe(false);
    await db.exec(`update private.customer_self_service_sessions set expires_at=now()+interval '1 hour' where auth_user_id='${user}'`);
    expect(await allowed()).toBe(true);
  });
  it("saves profile preferences without matching a phone to any order", async () => {
    await db.query("select customer_personal_save_profile($1)", [JSON.stringify({ name: "Name", phone: "99998888", notify_email: false, notify_whatsapp: true })]);
    expect((await snapshot()).profile).toMatchObject({ name: "Name", phone: "99998888" });
    expect((await db.query("select * from private.customer_personal_order_links")).rows).toHaveLength(1);
    await db.exec(`select set_config('test.user_id','${other}',false)`);
    expect((await snapshot()).profile.name).toBe("");
  });
  it("maintains exactly one default address across edits and deletions", async () => {
    const a = await saveAddress(); const b = await saveAddress();
    expect((await snapshot()).addresses.find(row => row.id === a)?.is_default).toBe(true);
    await saveAddress(b, true);
    expect((await snapshot()).addresses.filter(row => row.is_default).map(row => row.id)).toEqual([b]);
    await db.query("select customer_personal_delete_address($1)", [b]);
    expect((await snapshot()).addresses).toEqual([expect.objectContaining({ id: a, is_default: true })]);
  });
  it("rejects cross-account address edits/deletes and rolls back default changes on invalid data", async () => {
    const a = await saveAddress();
    await expect(db.query("select customer_personal_save_address(null,$1)", [JSON.stringify({ ...address, label: "", is_default: true })])).rejects.toThrow();
    expect((await snapshot()).addresses[0].is_default).toBe(true);
    await db.exec(`select set_config('test.user_id','${other}',false)`);
    await expect(saveAddress(a)).rejects.toThrow("address_not_found");
    await expect(db.query("select customer_personal_delete_address($1)", [a])).rejects.toThrow("address_not_found");
    expect((await snapshot()).addresses).toEqual([]);
  });
  it("accepts personal Storage uploads even when the organization predicate is evaluated", async () => {
    const path = `${user}/${order}/00000000-0000-0000-0000-000000000008.pdf`;
    await db.exec("set role authenticated");
    await db.query("insert into storage.objects values('customer-payment-evidence',$1)", [path]);
    await expect(db.query("insert into storage.objects values('customer-payment-evidence',$1)", [`${other}/${order}/00000000-0000-0000-0000-000000000008.pdf`])).rejects.toThrow();
    await db.exec("reset role");
  });
  it("submits evidence once, queues finance email, and never marks the order paid", async () => {
    const path = `${user}/${order}/00000000-0000-0000-0000-000000000008.pdf`;
    await db.query("insert into storage.objects values('customer-payment-evidence',$1)", [path]);
    await db.query("select customer_personal_submit_evidence($1,$2,100)", [order, path]);
    await db.query("select customer_personal_submit_evidence($1,$2,100)", [order, path]);
    expect((await snapshot()).evidence).toHaveLength(1);
    expect((await db.query("select recipient from customer_personal_evidence_email_outbox")).rows).toEqual([{ recipient: "finance@example.com" }]);
    expect((await db.query("select outstanding from orders")).rows[0]).toEqual({ outstanding: "100" });
    await db.exec(`select set_config('test.user_id','${other}',false)`);
    await expect(db.query("select customer_personal_submit_evidence($1,$2,100)", [order, path])).rejects.toThrow("evidence_access_required");
    expect((await snapshot()).evidence).toEqual([]);
  });
  it("rejects absent files and invalid payment amounts", async () => {
    const path = `${user}/${order}/00000000-0000-0000-0000-000000000008.pdf`;
    await expect(db.query("select customer_personal_submit_evidence($1,$2,100)", [order, path])).rejects.toThrow("evidence_file_missing");
    await db.query("insert into storage.objects values('customer-payment-evidence',$1)", [path]);
    for (const amount of [0, -1, 100.001, 101]) await expect(db.query("select customer_personal_submit_evidence($1,$2,$3)", [order, path, amount])).rejects.toThrow("invalid_payment_amount");
  });
  it("rebuilds only uniquely mapped simple variants and preserves bigint IDs as strings", async () => {
    await db.exec(`insert into order_lines(order_id,product_id,quantity) values('${order}','${product}',2),('${order}','${product}',3);
      insert into shopify_catalog_mappings values('${store}',123,9007199254740993,'${product}','product_variant');
      insert into shopify_catalog_drafts values('${draft}','${store}',123,'active','approved','product');
      insert into shopify_catalog_draft_variants values('${draft}',9007199254740993,false);`);
    const cart = async () => (await db.query<{ cart: unknown }>("select customer_personal_reorder($1) cart", [order])).rows[0].cart;
    expect(await cart()).toEqual({ domain: "catering.myshopify.com", items: [{ variant: "9007199254740993", quantity: 5 }] });
    await db.exec("update order_lines set remarks_1='No onions'"); await expect(cart()).rejects.toThrow("reorder_options_required");
    await db.exec("update order_lines set remarks_1=null;update shopify_catalog_drafts set shopify_status='draft'"); await expect(cart()).rejects.toThrow("reorder_unavailable");
    await db.exec(`select set_config('test.user_id','${other}',false)`); await expect(cart()).rejects.toThrow("order_access_required");
  });
  it("resolves historical B orders through the bound Lunch Box channel without a Shopify store ID", async () => {
    await db.exec(`update channels set name='HK lunch box' where id='${brand}';
      update shopify_stores set shop_domain='hklunchbox.myshopify.com' where id='${store}';
      update orders set order_number='B-1550C',shopify_store_id=null where id='${order}';`);
    const result = await db.query<{ data: { order_states: Record<string, { store_domain: string | null }> } }>("select customer_personal_snapshot() data");
    expect(result.rows[0].data.order_states[order].store_domain).toBe("hklunchbox.myshopify.com");
  });
  it("resolves only the order's own trusted brand website, never another brand", async () => {
    const states = async (uid = user) => {
      await db.exec(`select set_config('test.user_id','${uid}',false)`);
      return (await db.query<{ data: { order_states: Record<string, { store_domain: string | null }> } }>("select customer_personal_snapshot() data")).rows[0].data.order_states;
    };
    expect((await states())[order].store_domain).toBe("catering.myshopify.com");
    // An ambiguous channel (two active stores) is never guessed.
    await db.exec(`insert into shopify_stores values('00000000-0000-0000-0000-0000000000aa','${brand}','other.myshopify.com',true)`);
    expect((await states())[order].store_domain).toBeNull();
    // An inactive store or a non-Shopify domain is not reused.
    await db.exec(`update shopify_stores set is_active=false where id='${store}'; delete from shopify_stores where id='00000000-0000-0000-0000-0000000000aa';`);
    expect((await states())[order].store_domain).toBeNull();
    // The order's own configured store wins when set and active.
    await db.exec(`update shopify_stores set is_active=true where id='${store}'; update orders set shopify_store_id='${store}' where id='${order}'`);
    expect((await states())[order].store_domain).toBe("catering.myshopify.com");
    // A different account never learns this order's brand.
    expect((await states(other))[order]?.store_domain).toBeUndefined();
  });
  it("blocks anonymous/unverified accounts and direct private-table access", async () => {
    await db.exec(`update auth.users set email_confirmed_at=null where id='${user}'`); await expect(snapshot()).rejects.toThrow("email_verification_required");
    await db.exec("select set_config('test.user_id','',false)"); await expect(snapshot()).rejects.toThrow("email_verification_required");
    expect((await db.query<{ allowed: boolean }>("select has_function_privilege('anon','customer_personal_snapshot()','EXECUTE') allowed")).rows[0].allowed).toBe(false);
    expect((await db.query<{ allowed: boolean }>("select has_table_privilege('authenticated','private.customer_personal_addresses','SELECT') allowed")).rows[0].allowed).toBe(false);
  });
});
