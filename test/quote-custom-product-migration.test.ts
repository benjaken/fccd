import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("quote custom product migration", () => {
  it("creates a custom order line without adding a catalog product", () => {
    const sql = readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20260824110000_add_custom_quote_lines.sql"),
      "utf8",
    );

    expect(sql).toContain("function public.add_custom_quote_line");
    expect(sql).toContain("custom_product_name_required");
    expect(sql).toContain("insert into public.order_lines");
    expect(sql).toContain("product_name_snapshot");
    expect(sql).toContain("private.recalculate_quote_total");
  });

  it("snapshots 產品名稱 when adding a catalog quote line", () => {
    const sql = readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20260826120000_quote_line_product_name.sql"),
      "utf8",
    );
    expect(sql).toContain("coalesce(nullif(btrim(p.name), ''), p.chinese_name)");
    expect(sql).not.toContain("coalesce(p.chinese_name, p.name)");
  });
});
