import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260909020000_repair_customer_service_logic_utf8.sql",
);
const bytes = readFileSync(migrationPath);
const migration = new TextDecoder("utf-8", { fatal: true }).decode(bytes);

describe("customer-service UTF-8 repair migration", () => {
  it("is valid UTF-8 and contains every canonical intent", () => {
    expect(migration).toContain("提示注入攻擊");
    expect(migration).toContain("查詢訂單");
    expect(migration).toContain("投訴或售後問題");
    expect(migration).toContain("修改或取消訂單");
    expect(migration).toContain("索取餐牌");
    expect(migration).toContain("急單或廚房確認");
    expect(migration).toContain("到會或報價查詢");
    expect(migration).toContain("一般資料問題");
    expect(migration).toContain("人工客服");
    expect(migration).toContain("非客服範圍");

    const intentKeys = migration.match(/^\s{4}'[a-z_]+'[,]?$/gm) ?? [];
    expect(intentKeys.length).toBeGreaterThanOrEqual(10);
  });

  it("restores workflow policies and aborts if replacement characters remain", () => {
    expect(migration).toContain("'catering_inquiry'");
    expect(migration).toContain("'order_change'");
    expect(migration).toContain("訂餐／到會");
    expect(migration).toContain("訂單修改");
    expect(migration).toContain("customer_service_utf8_repair_failed");
    expect(migration).toContain("~ '[?�]'");
  });
});
