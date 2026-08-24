import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("quote package choice migration", () => {
  it("saves validated package choices against the newly-created order line", () => {
    const sql = readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20260824100000_add_quote_package_choices.sql"),
      "utf8",
    );

    expect(sql).toContain("p_package_choices jsonb");
    expect(sql).toContain("incomplete_package_choices");
    expect(sql).toContain("order_line_id uuid");
    expect(sql).toContain("insert into public.production_calculations");
    expect(sql).toContain("insert into public.order_package_choice_snapshots");
    expect(sql).toContain("packageProductIds");
  });
});
