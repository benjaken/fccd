import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("2026 Mid-Autumn unavailable-brand customer reply", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260915164000_update_mid_autumn_unavailable_brand_reply.sql"),
    "utf8",
  );

  it("updates both full-day allow-only rules with the unavailable-brand notice", () => {
    expect(sql).toContain("handling = 'allow_only'");
    expect(sql).toContain("中秋接單安排（19–20/9）");
    expect(sql).toContain("中秋接單安排（25–27/9）");
    expect(sql).toContain("XXX 9月19-20 及 25-27日不接單");
    expect(sql).not.toContain("FCC👇🏻");
    expect(sql).not.toContain("FCK👇🏻");
  });
});
