import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const user = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const order = "00000000-0000-0000-0000-000000000003";
const org = "00000000-0000-0000-0000-000000000004";
const orgOrder = "00000000-0000-0000-0000-000000000005";
const outside = "00000000-0000-0000-0000-000000000006";
let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user_id',true),'')::uuid$$;
    create function private.customer_personal_owns_order(p_order_id uuid) returns boolean language sql as $$
      select p_order_id='${order}'::uuid and auth.uid()='${user}'::uuid$$;
    create table customer_organizations(id uuid primary key);
    create table customer_memberships(user_id uuid, organization_id uuid, is_active boolean);
    create table customer_portal_orders(order_id uuid primary key, organization_id uuid);
    create table customer_personal_quotes(order_id uuid primary key);
    create table private.customer_personal_order_links(order_id uuid primary key);
    create table orders(id uuid primary key, document_type text, delivery_status text, archived_at timestamptz, email_snapshot text, order_number text, delivery_at timestamptz);
    insert into auth.users values('${user}','person@example.com',now()),('${other}','org@example.com',now());
    insert into customer_organizations values('${org}');
    insert into customer_memberships values('${other}','${org}',true);
    insert into customer_portal_orders values('${orgOrder}','${org}');
    insert into private.customer_personal_order_links values('${order}');
    insert into orders values
      ('${order}','order','已送達',null,'person@example.com','FCC-1','2026-10-14T04:00:00Z'),
      ('${orgOrder}','order','已送達',null,'org@example.com','FCC-2','2026-10-14T04:00:00Z'),
      ('${outside}','order','已送達',null,'other@example.com','FCC-3','2026-10-14T04:00:00Z');`);
  await db.exec(readFileSync("supabase/migrations/20261013200000_customer_order_feedback.sql", "utf8"));
  await db.exec(`create function private.personal_email_matches_order(p_order orders,p_email text)
    returns boolean language sql as $$select lower(btrim(p_order.email_snapshot))=lower(btrim(p_email))$$;`);
  await db.exec(readFileSync("supabase/migrations/20261014132000_customer_email_matched_order_feedback.sql", "utf8"));
}, 20000);
afterEach(async () => { await db.close(); });

describe("order feedback links", () => {
  it("emails a historical order claimed by verified email without an explicit link", async () => {
    await db.exec("delete from private.customer_personal_order_links");
    await db.query("select private.customer_order_feedback_enqueue($1)", [order]);
    const queue=(await db.query<{token:string;recipient:string}>("select token,recipient from customer_order_feedback_email_outbox")).rows;
    expect(queue).toEqual([{token:expect.stringMatching(/^[0-9a-f]{64}$/),recipient:"person@example.com"}]);
    await db.exec(`select set_config('test.user_id','${user}',false)`);
    expect((await db.query<{data:{submitted:boolean}}>("select customer_portal_order_feedback($1) data",[order])).rows[0].data.submitted).toBe(false);
    await db.query("select private.customer_order_feedback_enqueue($1)", [order]);
    expect((await db.query("select id from customer_order_feedback_email_outbox")).rows).toHaveLength(1);
  });
  it("does not claim an unverified mailbox for feedback", async () => {
    await db.exec(`delete from private.customer_personal_order_links;update auth.users set email_confirmed_at=null`);
    await db.query("select private.customer_order_feedback_enqueue($1)", [order]);
    expect((await db.query("select id from customer_order_feedback_email_outbox")).rows).toHaveLength(0);
  });
  it("emails one token for a portal order and keeps the comment on that order", async () => {
    await db.query("select private.customer_order_feedback_enqueue($1)", [order]);
    await db.query("select private.customer_order_feedback_enqueue($1)", [order]);
    await db.query("select private.customer_order_feedback_enqueue($1)", [outside]);
    const queued = (await db.query<{ token: string; recipient: string }>("select token, recipient from customer_order_feedback_email_outbox")).rows;
    expect(queued).toEqual([{ token: expect.stringMatching(/^[0-9a-f]{64}$/), recipient: "person@example.com" }]);
    const stored = (await db.query<{ token_hash: string }>("select token_hash from customer_order_feedback where order_id=$1", [order])).rows[0];
    expect(stored.token_hash).not.toBe(queued[0].token);
    const opened = (await db.query<{ data: { order_number: string; submitted: boolean } }>("select customer_order_feedback_open($1) data", [queued[0].token])).rows[0].data;
    expect(opened).toMatchObject({ order_number: "FCC-1", submitted: false });
    const saved = (await db.query<{ data: { comment: string; submitted: boolean } }>("select customer_order_feedback_submit($1,$2) data", [queued[0].token, " 準時送達 "])).rows[0].data;
    expect(saved).toMatchObject({ comment: "準時送達", submitted: true });
    await expect(db.query("select customer_order_feedback_submit($1,$2)", [queued[0].token, "第二份"])).rejects.toThrow("feedback_already_submitted");
    await db.exec(`select set_config('test.user_id','${user}',false)`);
    const seen = (await db.query<{ data: { comment: string } }>("select customer_portal_order_feedback($1) data", [order])).rows[0].data;
    expect(seen.comment).toBe("準時送達");
    await db.exec(`select set_config('test.user_id','${other}',false)`);
    await expect(db.query("select customer_portal_order_feedback($1)", [order])).rejects.toThrow("feedback_unavailable");
  });
});
