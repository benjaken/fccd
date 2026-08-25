import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("Shopify pending catalog integration", () => {
  it("registers specific routes before the generic product route and maps page access", () => {
    const app = read("src/App.tsx");
    const access = read("src/auth/use-page-access.ts");
    expect(app).toContain('path="/products/shopify-pending"');
    expect(app).toContain('path="/products/shopify-pending/:id"');
    expect(app.indexOf('path="/products/shopify-pending/:id"')).toBeLessThan(app.indexOf('path="/products/:id"'));
    expect(access).toContain('{ prefix: "/products/shopify-pending", pageKey: "products.shopify_pending" }');
  });

  it("adds permission-filtered navigation and bilingual catalog copy", () => {
    const nav = read("src/lib/nav.ts");
    const i18n = read("src/i18n.ts");
    expect(nav).toContain('permissionKey: "products.shopify_pending"');
    expect(i18n).toContain('shopifyPendingProducts: "Shopify待審商品"');
    expect(i18n).toContain('shopifyPendingProducts: "Shopify Products to Review"');
    expect(i18n.match(/shopifyCatalog:/g)).toHaveLength(2);
  });
});
