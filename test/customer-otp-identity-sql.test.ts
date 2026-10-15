import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
let db: PGlite;
const user="00000000-0000-0000-0000-000000000001", other="00000000-0000-0000-0000-000000000002", order="00000000-0000-0000-0000-000000000003";
beforeEach(async()=>{
  db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;create schema extensions;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user_id',true),'')::uuid$$;
    create function extensions.digest(text,text) returns bytea language sql as $$select decode(md5($1),'hex')$$;
    create table orders(id uuid primary key,order_number text,document_type text,archived_at timestamptz,email_snapshot text,
      contact_number_a_snapshot text,contact_number_b_snapshot text,created_at timestamptz default now(),bubble_created_at timestamptz,
      delivery_at timestamptz,grand_total numeric,currency text);`);
  const legacy=readFileSync("supabase/migrations/20260827200000_customer_self_service_portal.sql","utf8");
  await db.exec(legacy.slice(0,legacy.indexOf("create or replace function public.customer_self_service_login")).replace("create extension if not exists pgcrypto;",""));
  await db.exec(readFileSync("supabase/migrations/20261012110000_customer_otp_identity.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261013110000_customer_personal_contact_match.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261013140000_customer_personal_email_match.sql","utf8"));
  await db.exec(`create table customer_portal_orders(order_id uuid primary key,organization_id uuid);
    create function private.customer_personal_user() returns uuid language sql as $$select auth.uid()$$;`);
  await db.exec(readFileSync("supabase/migrations/20261014130000_customer_personal_order_isolation.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261015200000_customer_personal_order_scan_perf.sql","utf8"));
  await db.exec("create table customer_organizations(id uuid primary key,name text,is_active boolean);create table customer_memberships(user_id uuid,organization_id uuid,is_active boolean)");
  await db.exec(readFileSync("supabase/migrations/20261012120000_customer_portal_identities.sql","utf8"));
  await db.exec(`insert into auth.users values('${user}','person@example.com',now()),('${other}','other@example.com',now());
    insert into orders(id,order_number,document_type,email_snapshot,contact_number_a_snapshot,grand_total,currency)
      values('${order}','FCCD-1','order','person@example.com','51634127',100,'HKD');
    select set_config('test.user_id','${user}',false);`);
},20000);
afterEach(async()=>{await db.close();});
async function session(){return (await db.query<{s:{token:string;orders:Array<{id:string}>}}>("select customer_personal_session() s")).rows[0].s;}
describe("verified personal OTP identity",()=>{
  it("keeps enterprise orders out of personal listing and actions after membership revocation",async()=>{
    await db.exec(`insert into customer_portal_orders values('${order}','${other}');
      insert into customer_organizations values('${other}','Company',true);
      insert into customer_memberships values('${user}','${other}',false);
      insert into private.customer_personal_order_links values('${order}','${user}','${user}',now(),'old link');`);
    const personal=await session();
    expect(personal.orders).toEqual([]);
    expect((await db.query<{allowed:boolean}>("select private.customer_personal_owns_order($1) allowed",[order])).rows[0].allowed).toBe(false);
    expect((await db.query<{allowed:boolean}>(`select private.self_service_order_matches(o,s.phone_hash,s.email_hash) allowed
      from orders o cross join private.customer_self_service_sessions s where s.token=$1`,[personal.token])).rows[0].allowed).toBe(false);
  });
  it("exposes organization switching only for an active verified membership",async()=>{
    const identities=async()=> (await db.query<{i:{personal:boolean;organization:boolean}}>("select customer_portal_identities() i")).rows[0].i;
    expect(await identities()).toMatchObject({personal:true,organization:false});
    await db.exec(`insert into customer_organizations values('${order}','Org',true);insert into customer_memberships values('${user}','${order}',true)`);
    expect(await identities()).toMatchObject({organization:true});
    await db.exec("update customer_memberships set is_active=false");expect(await identities()).toMatchObject({organization:false});
  });
  it("allows verified new users with zero orders when the email does not match",async()=>{
    await db.exec("update orders set email_snapshot='someone-else@example.com'");
    expect((await session()).orders).toEqual([]);
    await db.exec(`select set_config('test.user_id','${other}',false)`);expect((await session()).orders).toEqual([]);
  });
  it("lists historical orders from the verified email without a phone",async()=>{
    const matched=await session();
    expect(matched.needsPhone).toBe(false);
    expect(matched.orders.map(o=>o.id)).toEqual([order]);
    const guard=await db.query<{allowed:boolean}>(`select private.self_service_order_matches(o,s.phone_hash,s.email_hash) allowed
      from orders o cross join private.customer_self_service_sessions s where s.token=$1`,[matched.token]);
    expect(guard.rows[0].allowed).toBe(true);
    await db.exec(`select set_config('test.user_id','${other}',false)`);
    expect((await session()).orders).toEqual([]);
  });
  it("does not bind company inboxes even when the address matches",async()=>{
    await db.exec(`update auth.users set email='sales@foodchannels-catering.com' where id='${user}';
      update orders set email_snapshot='sales@foodchannels-catering.com' where id='${order}'`);
    expect((await session()).orders).toEqual([]);
    await db.exec(`update auth.users set email='foodchannels.plan@gmail.com' where id='${user}';
      update orders set email_snapshot='foodchannels.plan@gmail.com' where id='${order}'`);
    expect((await session()).orders).toEqual([]);
  });
  it("returns only trusted links and scopes the existing detail/add-on guard to those links",async()=>{
    await db.exec(`insert into private.customer_personal_order_links(order_id,user_id,linked_by,reason) values('${order}','${user}','${user}','Verified reconciliation')`);
    const own=await session();expect(own.orders.map(o=>o.id)).toEqual([order]);
    const guard=await db.query<{allowed:boolean}>(`select private.self_service_order_matches(o,s.phone_hash,s.email_hash) allowed
      from orders o cross join private.customer_self_service_sessions s where s.token=$1`,[own.token]);expect(guard.rows[0].allowed).toBe(true);
    await db.exec(`select set_config('test.user_id','${other}',false)`);const otherSession=await session();expect(otherSession.orders).toEqual([]);
    const denied=await db.query<{allowed:boolean}>(`select private.self_service_order_matches(o,s.phone_hash,s.email_hash) allowed
      from orders o cross join private.customer_self_service_sessions s where s.token=$1`,[otherSession.token]);expect(denied.rows[0].allowed).toBe(false);
    await db.exec(`delete from private.customer_personal_order_links where order_id='${order}'`);
    expect((await db.query<{allowed:boolean}>(`select private.self_service_order_matches(o,s.phone_hash,s.email_hash) allowed
      from orders o cross join private.customer_self_service_sessions s where s.token=$1`,[own.token])).rows[0].allowed).toBe(true);
    await db.exec("update orders set email_snapshot='someone-else@example.com'");
    expect((await db.query<{allowed:boolean}>(`select private.self_service_order_matches(o,s.phone_hash,s.email_hash) allowed
      from orders o cross join private.customer_self_service_sessions s where s.token=$1`,[own.token])).rows[0].allowed).toBe(false);
  });
  it("reuses a live session, and logout revokes all capabilities for only the current user",async()=>{
    const a=await session();expect((await session()).token).toBe(a.token);
    await db.exec(`select set_config('test.user_id','${other}',false)`);const b=await session();
    await db.exec(`select set_config('test.user_id','${user}',false);select customer_personal_logout()`);
    expect((await db.query("select token from private.customer_self_service_sessions where token=$1",[a.token])).rows).toEqual([]);
    expect((await db.query("select token from private.customer_self_service_sessions where token=$1",[b.token])).rows).toHaveLength(1);
  });
  it("rejects unverified and anonymous users and cannot grant table access through OTP",async()=>{
    await db.exec(`update auth.users set email_confirmed_at=null where id='${user}'`);
    await expect(session()).rejects.toThrow("email_verification_required");
    await db.exec("select set_config('test.user_id','',false)");await expect(session()).rejects.toThrow("email_verification_required");
    const permissions=await db.query<{anonymous:boolean;table:boolean}>(`select has_function_privilege('anon','public.customer_personal_session()','EXECUTE') anonymous,
      has_table_privilege('authenticated','private.customer_personal_order_links','INSERT') "table"`);
    expect(permissions.rows[0]).toEqual({anonymous:false,table:false});
  });
  it("keeps the original phone/email lookup guard unchanged for legacy sessions",async()=>{
    const result=await db.query<{allowed:boolean}>(`select private.self_service_order_matches(o,extensions.digest(private.self_service_phone('51634127'),'sha256'),
      extensions.digest('person@example.com','sha256')) allowed from orders o`);expect(result.rows[0].allowed).toBe(true);
  });
});
