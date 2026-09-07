import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { formatShopOrderNumber } from "@/lib/shop-orders";

describe("restaurant frozen and dry-goods order numbers", () => {
  it("normalizes legacy SO numbers to the original frozen-order format", () => {
    expect(formatShopOrderNumber("SO-20260907-0004")).toBe("R - 202609 - 4");
    expect(formatShopOrderNumber("R - 202609 - 15")).toBe("R - 202609 - 15");
  });

  it("allocates new batch numbers from the shared monthly R-number series", () => {
    const migration = readFileSync(
      path.resolve("supabase/migrations/20260907110000_use_meat_order_number_format_for_shop_orders.sql"),
      "utf8",
    );

    expect(migration).toContain("from public.meat_orders");
    expect(migration).toContain("from public.shop_order_batches");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("'R - ' || v_month || ' - '");
  });
});
