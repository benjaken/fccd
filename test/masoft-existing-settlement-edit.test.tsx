import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20261009120000_masoft_existing_settlement_edit.sql";
const settlementId = "00000000-0000-0000-0000-000000000001";
const paymentIds = ["00000000-0000-0000-0000-000000000011", "00000000-0000-0000-0000-000000000012"];

async function fixture(permissionWrapper = false) {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth; create schema private;
    create function auth.jwt() returns jsonb language sql as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
    $$;
    create function private.lock_material_writes() returns void language sql as $$ select $$;
    create table payment_settlements (
      id uuid primary key, legacy_id text, channel_id uuid, payment_method_id uuid,
      invoice_number text, receipt_number text, payout_at timestamptz,
      gross_amount numeric, charges numeric, net_amount numeric
    );
    create table payments (
      id uuid primary key, legacy_id text, order_id uuid, channel_id uuid,
      payment_method_id uuid, amount numeric, voided_at timestamptz,
      payout_at timestamptz, updated_at timestamptz
    );
    create table payment_settlement_payments (
      id uuid primary key default gen_random_uuid(), payment_settlement_id uuid,
      payment_id uuid unique, payment_settlement_legacy_id text, payment_legacy_id text
    );
    insert into payment_settlements values
      ('${settlementId}','settlement', '${settlementId}', '${settlementId}', null,null,'2026-09-14',12070,213.1,11856.9);
    insert into payments(id,legacy_id,order_id,channel_id,payment_method_id,amount) values
      ('${paymentIds[0]}','p1','${settlementId}','${settlementId}','${settlementId}',4910),
      ('${paymentIds[1]}','p2','${settlementId}','${paymentIds[1]}','${settlementId}',7160);
    insert into payment_settlement_payments(payment_settlement_id,payment_id) values
      ('${settlementId}','${paymentIds[0]}'),('${settlementId}','${paymentIds[1]}');
    select set_config('request.jwt.claims','{"app_metadata":{"role":"Admin"}}',false);
  `);
  const old = readFileSync("supabase/migrations/20260820161500_preserve_unverified_payment_settlement_amount.sql", "utf8");
  await db.exec(old);
  if (permissionWrapper) {
    const source = readFileSync("supabase/migrations/20260908224000_lock_existing_material_rpcs.sql", "utf8");
    const start = source.indexOf("create or replace function public.update_payment_settlement_permission_impl(");
    const end = source.indexOf("\n$$;", start) + 4;
    await db.exec(source.slice(start, end));
    await db.exec(`
      create or replace function public.update_payment_settlement(
        p_settlement_id uuid,p_invoice_number text,p_receipt_number text,p_payout_at date,
        p_charges numeric,p_payment_ids uuid[],p_preserve_payment_amount boolean default false
      ) returns void language plpgsql security definer as $$ begin
        if coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'Admin' then
          raise exception 'insufficient_privilege';
        end if;
        perform public.update_payment_settlement_permission_impl(
          p_settlement_id,p_invoice_number,p_receipt_number,p_payout_at,p_charges,p_payment_ids,p_preserve_payment_amount
        );
      end $$;
    `);
  }
  await db.exec(readFileSync(migrationPath, "utf8"));
  return db;
}

async function save(db: PGlite, ids = paymentIds, charges = 220) {
  return db.query("select public.update_payment_settlement($1,' INV/2026090015 ',' REC-1 ',$2,$3,$4,false)",
    [settlementId, "2026-09-15", charges, ids]);
}

describe("editing existing mixed-brand Masoft receipts", () => {
  for (const permissionWrapper of [false, true]) {
    it(`saves metadata without replacing payment links (${permissionWrapper ? "permission wrapper" : "legacy production RPC"})`, async () => {
      const db = await fixture(permissionWrapper);
      try {
        const before = await db.query("select id from payment_settlement_payments order by id");
        await save(db, [paymentIds[1], paymentIds[0], paymentIds[0]]);
        expect((await db.query("select invoice_number,receipt_number,gross_amount,charges,net_amount,payout_at from payment_settlements")).rows[0])
          .toMatchObject({ invoice_number: "INV/2026090015", receipt_number: "REC-1", gross_amount: "12070", charges: "220", net_amount: "11850.00", payout_at: new Date("2026-09-14T16:00:00Z") });
        expect((await db.query("select id from payment_settlement_payments order by id")).rows).toEqual(before.rows);
        expect((await db.query("select distinct payout_at from payments")).rows).toEqual([{ payout_at: new Date("2026-09-14T16:00:00Z") }]);
        // Reapplying the migration must not duplicate the inserted metadata path.
        await db.exec(readFileSync(migrationPath, "utf8"));
        await save(db);
      } finally { await db.close(); }
    });
  }

  it("still rejects a changed payment selection with a different brand and negative net receipts", async () => {
    const db = await fixture();
    try {
      await expect(save(db, [paymentIds[1]])).rejects.toThrow("payments must match the settlement channel and payment method");
      await expect(save(db, paymentIds, 13000)).rejects.toThrow("net amount cannot be negative");
      expect((await db.query("select invoice_number from payment_settlements")).rows).toEqual([{ invoice_number: null }]);
      await expect(save(db, [])).rejects.toThrow("at least one payment is required");
    } finally { await db.close(); }
  });

  it("still recalculates amounts when a valid payment selection changes", async () => {
    const db = await fixture(true);
    try {
      await save(db, [paymentIds[0]]);
      expect((await db.query("select gross_amount,net_amount from payment_settlements")).rows)
        .toEqual([{ gross_amount: "4910.00", net_amount: "4690.00" }]);
      expect((await db.query("select payment_id from payment_settlement_payments")).rows)
        .toEqual([{ payment_id: paymentIds[0] }]);
    } finally { await db.close(); }
  });

  for (const permissionWrapper of [false, true]) {
    it(`preserves authorization (${permissionWrapper ? "permission wrapper" : "legacy production RPC"})`, async () => {
      const db = await fixture(permissionWrapper);
      try {
        await db.exec("select set_config('request.jwt.claims','{}',false)");
        await expect(save(db)).rejects.toThrow(permissionWrapper ? "insufficient_privilege" : "administrator access required");
      } finally { await db.close(); }
    });
  }
});
