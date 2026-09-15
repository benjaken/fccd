import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("grants both admin roles access and management through the promotion tree", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table app_pages (
        page_key text primary key, display_name text, route text, sort_order int,
        is_high_risk boolean, parent_page_key text references app_pages(page_key),
        page_kind text, updated_at timestamptz
      );
      create table role_page_permissions (
        role text, page_key text references app_pages(page_key),
        can_access boolean, can_manage boolean, updated_at timestamptz,
        primary key(role, page_key)
      );
      insert into app_pages(page_key) values ('settings');
      insert into app_pages(page_key, parent_page_key)
      select key, 'settings' from unnest(array[
        'settings.wati_email_logs', 'settings.customer_faq', 'settings.dictionaries',
        'settings.notifications', 'settings.districts', 'settings.attachments'
      ]) key;
      insert into app_pages(page_key, parent_page_key)
      values ('settings.customer_faq.edit', 'settings.customer_faq');
      insert into role_page_permissions values ('Admin', 'settings.customer_faq', false, false, now());
    `);
    const migration = readFileSync("supabase/migrations/20260915120000_promotion_settings_navigation.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);
    const result = await db.query<{ role: string; count: number }>(`
      select role, count(*)::int as count from role_page_permissions
      where can_access and can_manage group by role order by role
    `);
    expect(result.rows).toEqual([{ role: "Admin", count: 8 }, { role: "Super Admin", count: 8 }]);
  } finally {
    await db.close();
  }
});
