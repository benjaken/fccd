import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migration = (name: string) =>
  readFileSync(`supabase/migrations/${name}`, "utf8");

describe("customer service review repairs", () => {
  it("withdraws edited active cases and resumes unsent same-day reminders", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create schema extensions; create schema private;
        create table orders (
          id uuid primary key, order_status_legacy_ids text[],
          document_type text default 'order', archived_at timestamptz,
          delivery_at timestamptz
        );
        create table order_statuses (legacy_id text, name text, archived_at timestamptz);
        create table wati_order_notification_templates (
          id uuid primary key, event_key text, is_active boolean
        );
        create table wati_order_notification_outbox (
          id uuid default gen_random_uuid(), order_id uuid, template_id uuid,
          event_key text, occurrence_key text, status text default 'pending',
          wati_sent_at timestamptz, wati_skipped_at timestamptz,
          email_sent_at timestamptz, email_skipped_at timestamptz,
          wati_error text, email_error text, last_error text,
          locked_at timestamptz, updated_at timestamptz, sent_at timestamptz,
          unique (order_id, template_id, occurrence_key)
        );
        create function private.wati_order_is_cancelled(orders)
          returns boolean language sql as 'select false';
        create function private.wati_order_is_pending_review(orders)
          returns boolean language sql as 'select false';
        create function private.wati_delivery_method(orders)
          returns text language sql as 'select ''delivery''::text';
        create function private.wati_delivery_reminder_at(orders)
          returns timestamptz language sql as 'select $1.delivery_at';
      `);
      await db.exec(migration("20260919180000_customer_service_conversation_cases.sql")
        .replace("embedding vector(1024) not null", "embedding text not null"));
      await db.exec(migration("20260919090000_skip_reschedule_pending_order_notifications.sql"));
      await db.exec(migration("20260919210000_restore_review_and_reschedule_transitions.sql"));

      const { rows: [created] } = await db.query<{ id: string }>(`
        insert into customer_service_cases
          (title, scenario_context, environment, source_fingerprint)
        values ('Case', 'Context', 'develop', 'review-fixture') returning id
      `);
      await db.query(`update customer_service_cases set
        embedding_status = 'ready', content_hash = 'hash',
        reviewed_by = '00000000-0000-4000-8000-000000000011'
        where id = $1`, [created.id]);
      await db.query("update customer_service_cases set status = 'active' where id = $1", [created.id]);
      await db.query("update customer_service_cases set title = 'Edited' where id = $1", [created.id]);
      const { rows: [edited] } = await db.query<{
        status: string; revision: number; embedding_status: string; reviewed_by: string | null;
      }>("select status,revision,embedding_status,reviewed_by from customer_service_cases where id=$1", [created.id]);
      expect(edited).toMatchObject({
        status: "draft", revision: 2, embedding_status: "pending", reviewed_by: null,
      });

      await db.exec(`
        insert into order_statuses values ('reschedule', '改期未定', null);
        insert into orders (id, order_status_legacy_ids, delivery_at)
          values ('00000000-0000-4000-8000-000000000001', '{}', '2026-09-19T00:00:00+08:00');
        insert into wati_order_notification_templates
          values ('00000000-0000-4000-8000-000000000002', 'delivery_today_reminder', true);
      `);
      await db.query("select enqueue_due_wati_order_reminders('2026-09-19T10:00:00+08:00')");
      await db.exec(`
        update orders set order_status_legacy_ids = array['reschedule'];
        update wati_order_notification_outbox set
          status = 'skipped', last_error = 'order_reschedule_pending',
          wati_skipped_at = now(), email_skipped_at = now();
        update orders set order_status_legacy_ids = '{}';
      `);
      const { rows: [resumed] } = await db.query<{ enqueue_due_wati_order_reminders: number }>(
        "select enqueue_due_wati_order_reminders('2026-09-19T12:00:00+08:00')",
      );
      expect(resumed.enqueue_due_wati_order_reminders).toBe(1);
      const { rows: [outbox] } = await db.query<{
        status: string; last_error: string | null;
        wati_skipped_at: string | null; email_skipped_at: string | null;
      }>("select status,last_error,wati_skipped_at,email_skipped_at from wati_order_notification_outbox");
      expect(outbox).toMatchObject({
        status: "pending", last_error: null,
        wati_skipped_at: null, email_skipped_at: null,
      });
    } finally {
      await db.close();
    }
  });
});
