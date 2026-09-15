import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("2026 Mid-Autumn allowed-product reply", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260915153000_mid_autumn_allowed_product_reply.sql"),
    "utf8",
  );

  it("states that allowed products can be ordered outside the peak window", () => {
    expect(sql).toContain("Food Channels Catering（FCC）");
    expect(sql).toContain("Food Channels Kitchen（FCK）");
    expect(sql).toContain("17:00至19:00暫不接受自動落單");
    expect(sql).toContain("其餘時段可直接落單");
  });
});
