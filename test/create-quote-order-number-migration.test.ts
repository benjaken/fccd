import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260903024142_qualify_create_quote_order_number.sql",
  ),
  "utf8",
).replaceAll("\r\n", "\n");

describe("create_quote order_number qualification", () => {
  it("qualifies RETURNING so RETURNS TABLE does not clash with orders.order_number", () => {
    expect(sql).toContain("returning public.orders.order_number into v_order_number");
    expect(sql).not.toMatch(/returning\s+order_number\s+into/i);
  });

  it("keeps authenticated execute on the existing create_quote signature", () => {
    expect(sql).toContain("create or replace function public.create_quote(");
    expect(sql).toContain("p_order_number text default null");
    expect(sql).toContain(
      "grant execute on function public.create_quote(\n  uuid,text,text,text,text,text,text,uuid,text,uuid,date,text,text,text,text,uuid,text,uuid[],text\n) to authenticated;",
    );
  });
});
