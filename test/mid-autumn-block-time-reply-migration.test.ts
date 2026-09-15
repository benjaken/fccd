import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("2026 Mid-Autumn blocked-time customer reply", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260915163000_update_mid_autumn_block_time_reply.sql"),
    "utf8",
  );

  it("updates both 17:00-19:00 manual-review rules", () => {
    expect(sql).toContain("handling = 'manual_review'");
    expect(sql).toContain("start_time = '17:00'");
    expect(sql).toContain("end_time = '19:00'");
    expect(sql).toContain("中秋繁忙時段（19–20/9 17:00–19:00）");
    expect(sql).toContain("中秋繁忙時段（25–27/9 17:00–19:00）");
  });

  it("sends the online quotation form without seasonal catalog links", () => {
    expect(sql).toContain("請幫忙填一填這份報價表格留一留資料俾我地☺️，我們同事會盡快回覆");
    expect(sql).toContain("https://www.emailmeform.com/builder/form/E9Wuer6Mw0aqat3NHfmd8");
    expect(sql).not.toContain("mid-autumn-combo");
    expect(sql).not.toContain("mid-autumn-a-la-carte");
  });
});
