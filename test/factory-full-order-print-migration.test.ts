import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260925133000_atomic_factory_full_order_print.sql",
  ),
  "utf8",
);

describe("atomic factory full-order print migration", () => {
  it("validates the exact printable line set and commits the order in one RPC", () => {
    expect(migration).toContain(
      "create or replace function public.mark_factory_order_printed",
    );
    expect(migration).toContain("perform public.assert_factory_order_printable(p_order_id)");
    expect(migration).toContain("factory_order_print_set_changed");
    expect(migration).toContain("update public.order_lines");
    expect(migration).toContain("set factory_print_date = now()");
    expect(migration).toContain(
      "grant execute on function public.mark_factory_order_printed(uuid, uuid[])",
    );
  });
});
