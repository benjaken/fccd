import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { pageAccessKey } from "@/auth/use-page-access";

function source(relativePath: string) {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

describe("order shipping-fee permission", () => {
  it("maps the shipping-fee route to its dedicated page key", () => {
    expect(pageAccessKey("/orders/settings/shipping-fees")).toBe(
      "orders.settings.shipping_fees",
    );
  });

  it("grants Accounting management without granting all order settings", () => {
    const migration = source(
      "supabase/migrations/20260825070000_order_shipping_fees_permission.sql",
    );

    expect(migration).toContain("'orders.settings.shipping_fees'");
    expect(migration).toContain("role in ('Super Admin', 'Admin', 'Accounting')");
    expect(migration).toContain(
      "private.has_page_manage('orders.settings.shipping_fees')",
    );
  });
});
