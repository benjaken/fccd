import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260914101000_customer_service_kitchen_brand_faq.sql",
  ),
  "utf8",
);

describe("customer-service Kitchen brand FAQ", () => {
  it("answers 桂花八月 enquiries with catering details and its website", () => {
    expect(migration).toContain("桂花‧八月（Food Channels Kitchen）");
    expect(migration).toContain("私房菜套餐、海鮮、燉湯、鍋物及小菜");
    expect(migration).toContain("https://foodchannels-kitchen.com/");
    expect(migration).toContain(
      "question = 'Food Channels Kitchen 有冇餐牌可以睇？'",
    );
  });
});
