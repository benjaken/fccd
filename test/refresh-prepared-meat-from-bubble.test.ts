import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("refresh prepared meat from Bubble", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "supabase/functions/refresh-prepared-meat-from-bubble/index.ts"),
    "utf8",
  );

  it("refreshes 醃雞扒 by Bubble legacy id and overwrites existing rows", () => {
    expect(source).toContain('DEFAULT_ITEM_LEGACY_ID = "1697175689128x911263524366297900"');
    expect(source).toContain('CONFIRMATION = "REFRESH_PREPARED_MEAT_FROM_BUBBLE"');
    expect(source).toContain('equals("DoneMeat", itemLegacyId)');
    expect(source).toContain('upsert(chunk, { onConflict: "legacy_id" })');
    expect(source).toContain("prepared_meat_stock_movements");
    expect(source).toContain("meat_order_lines");
    expect(source).toContain("meat_seasoning_cost_versions");
  });
});
