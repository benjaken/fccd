import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("2026 Mid-Autumn brand menu FAQs", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260915166000_mid_autumn_brand_menu_faqs.sql"),
    "utf8",
  );

  it("publishes separate FCC and FCK replies", () => {
    expect(sql).toContain("Food Channels Catering 2026中秋餐牌");
    expect(sql).toContain("foodchannels-catering.com/collections/mid-autumn-combo");
    expect(sql).toContain("foodchannels-catering.com/collections/mid-autumn-a-la-carte");
    expect(sql).toContain("Food Channels Kitchen 2026中秋餐牌");
    expect(sql).toContain("foodchannels-kitchen.com/collections/mid-autumn-private-kitchen");
  });
});
