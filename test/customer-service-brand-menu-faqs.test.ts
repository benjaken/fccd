import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260905041000_customer_service_brand_menu_faqs.sql",
  ),
  "utf8",
);

describe("customer-service brand menu FAQs", () => {
  it.each([
    "HK Lunch Box",
    "HK Party Food",
    "Food Channels Catering",
    "Food Channels Express",
    "Food Channels Kitchen",
    "Food Channels Cuisine",
  ])("publishes a menu answer for %s", (brand) => {
    expect(sql).toContain(`${brand} 有冇餐牌可以睇？`);
  });

  it("keeps the supplied Lunch Box ordering and quotation links", () => {
    expect(sql).toContain("https://hklunchbox.com/collections/mealbox");
    expect(sql).toContain("網站最低消費 $800，每款便當最少訂購5份");
    expect(sql).toContain(
      "https://www.emailmeform.com/builder/form/E9Wuer6Mw0aqat3NHfmd8",
    );
  });

  it("keeps the generic question as a brand chooser", () => {
    expect(sql).toContain("請問你想查看哪一個品牌的餐牌？");
    expect(sql).toContain("你可以直接回覆品牌名稱或餐飲類型");
  });
});
