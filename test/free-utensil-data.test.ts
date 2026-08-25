import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("system utensil pricing", () => {
  it("keeps generated utensil lines free and repairs historical anomalies", () => {
    const migration = readFileSync(
      "supabase/migrations/20260825123000_keep_system_utensils_free.sql",
      "utf8",
    );

    expect(migration).toContain("new.unit_price := 0");
    expect(migration).toContain("new.total_price := 0");
    expect(migration).toContain("web-order-utensil-%");
    expect(migration).toContain("web-quote-utensil-%");
    expect(migration).toContain("shopify:%:utensils");
    expect(migration).toContain("outstanding = greatest");
  });
});
