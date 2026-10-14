import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("moves customer portal pages under the customer operations parent", async () => {
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
      insert into app_pages(page_key, parent_page_key) values
        ('promotion', null),
        ('settings.customer_portal', 'promotion'),
        ('settings.customer_portal.reward_rules', 'promotion');
      insert into role_page_permissions values
        ('Accounting', 'settings.customer_portal', true, false, now());
    `);
    const migration = readFileSync(
      "supabase/migrations/20261014260000_customer_operations_navigation.sql",
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);

    const parents = await db.query<{
      page_key: string;
      parent_page_key: string | null;
    }>(
      "select page_key, parent_page_key from app_pages where page_key like 'settings.customer_portal%' order by page_key",
    );
    expect(parents.rows).toEqual([
      {
        page_key: "settings.customer_portal",
        parent_page_key: "customer_operations",
      },
      {
        page_key: "settings.customer_portal.reward_rules",
        parent_page_key: "customer_operations",
      },
    ]);

    const admins = await db.query<{ role: string; count: number }>(
      `select role, count(*)::int as count from role_page_permissions
       where can_access and can_manage group by role order by role`,
    );
    expect(admins.rows).toEqual([
      { role: "Admin", count: 3 },
      { role: "Super Admin", count: 3 },
    ]);

    const delegated = await db.query<{
      can_access: boolean;
      can_manage: boolean;
    }>(
      "select can_access, can_manage from role_page_permissions where role = 'Accounting' and page_key = 'customer_operations'",
    );
    expect(delegated.rows).toEqual([{ can_access: true, can_manage: false }]);
  } finally {
    await db.close();
  }
});
