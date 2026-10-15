import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('resolves split parent entry warnings, prevents reopening, and preserves child/other issues', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema private;
      create table orders(id uuid primary key, order_status_legacy_ids text[]);
      create table order_statuses(legacy_id text, name text);
      create table order_reconciliation_issues(id int primary key, order_id uuid, issue_type text, status text, resolved_at timestamptz, last_checked_at timestamptz);
      create table order_reconciliation_alert_outbox(issue_id int, status text, locked_at timestamptz, last_error text, updated_at timestamptz);
      create table business_notifications(event_type text, entity_id uuid, resolved_at timestamptz, updated_at timestamptz);
      insert into order_statuses values ('split-id', '已拆單'), ('other', '月結');
      insert into orders values ('00000000-0000-0000-0000-000000000001', array['split-id']), ('00000000-0000-0000-0000-000000000002', '{}');
      insert into order_reconciliation_issues(id,order_id,issue_type,status) values
        (1,'00000000-0000-0000-0000-000000000001','missing_fccd','open'),
        (2,'00000000-0000-0000-0000-000000000002','missing_fccd','open'),
        (3,'00000000-0000-0000-0000-000000000001','insufficient_stock','open');
      insert into order_reconciliation_alert_outbox(issue_id,status) values (1,'pending'),(1,'sent'),(2,'pending'),(3,'pending');
    `);
    await db.exec(readFileSync('supabase/migrations/20261015080000_exclude_split_order_missing_entry.sql', 'utf8'));
    expect((await db.query('select status from order_reconciliation_issues order by id')).rows).toEqual([{status:'resolved'},{status:'open'},{status:'open'}]);
    expect((await db.query('select status from order_reconciliation_alert_outbox order by issue_id,status')).rows).toEqual([{status:'sent'},{status:'skipped'},{status:'pending'},{status:'pending'}]);
    await db.exec("update order_reconciliation_issues set status='open' where id=1");
    expect((await db.query('select status from order_reconciliation_issues where id=1')).rows).toEqual([{status:'resolved'}]);
    await db.exec("update orders set order_status_legacy_ids=array['split-id'] where id='00000000-0000-0000-0000-000000000002'");
    expect((await db.query('select status from order_reconciliation_issues where id=2')).rows).toEqual([{status:'resolved'}]);
    await db.exec("insert into order_reconciliation_issues(id,order_id,issue_type,status) values (4,'00000000-0000-0000-0000-000000000001','unlinked_fccd','open')");
    expect((await db.query('select status from order_reconciliation_issues where id=4')).rows).toEqual([{status:'resolved'}]);
  } finally { await db.close(); }
}, 20000);
