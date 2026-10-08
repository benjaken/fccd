import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("keeps newer date ranges ahead of older Facebook costs across pages", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table monthly_costs(id uuid, month_at timestamptz, festival_range_start timestamptz,
        festival_range_end timestamptz, festival_amount numeric, remarks text,
        cost_type_id uuid, festival_id uuid, primary_channel_id uuid, bubble_created_at timestamptz);
      create table cost_types(id uuid, name text);
      create table festivals(id uuid, name text);
      create table channels(id uuid, name text, sort_order integer);
      create table monthly_cost_channels(monthly_cost_id uuid, channel_id uuid);
      insert into cost_types values ('00000000-0000-0000-0000-000000000001','Facebook'),
        ('00000000-0000-0000-0000-000000000002','Google');
      insert into monthly_costs(id,month_at,festival_range_start,festival_range_end,festival_amount,cost_type_id)
      select ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, '2026-09-01',
        case when n=1 then '2026-08-31'::timestamptz else '2026-09-19'::timestamptz end,
        '2026-09-27', 1,
        case when n=1 then '00000000-0000-0000-0000-000000000001'::uuid
          else '00000000-0000-0000-0000-000000000002'::uuid end
      from generate_series(1,3) n;
    `);
    const baseline = readFileSync(resolve(process.cwd(), "supabase/migrations/20260819230000_kitchen_weekly_cost_input.sql"), "utf8");
    const oldFunction = baseline.slice(baseline.indexOf("create or replace function public.get_kitchen_monthly_festival_costs("));
    await db.exec(oldFunction.slice(0, oldFunction.indexOf("$$;") + 3));
    const before = await db.query<{ id: string }>("select * from get_kitchen_monthly_festival_costs(2,0)");
    expect(before.rows[0]?.id.slice(-1)).toBe("1");
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261008040000_festival_cost_date_order.sql"), "utf8");
    await db.exec(migration);
    const first = await db.query<{ id: string; total_count: number }>("select * from get_kitchen_monthly_festival_costs(2,0)");
    const second = await db.query<{ id: string }>("select * from get_kitchen_monthly_festival_costs(2,2)");
    expect(first.rows.map((row) => row.id.slice(-1))).toEqual(["2", "3"]);
    expect(second.rows.map((row) => row.id.slice(-1))).toEqual(["1"]);
    expect(Number(first.rows[0]?.total_count)).toBe(3);
  } finally {
    await db.close();
  }
});
