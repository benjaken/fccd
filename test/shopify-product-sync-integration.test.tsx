import { readAppStyles } from "./read-app-styles";
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
    expect(i18n).toContain('shopifyPendingProducts: "Shopify 待審商品"');
    expect(i18n).toContain('shopifyPendingProducts: "Shopify Products to Review"');
    expect(i18n.match(/shopifyCatalog:/g)).toHaveLength(2);
  });

  it("uses the shared table layout and static pagination separators", () => {
    const page = read("src/components/ShopifyPendingProductsPage.tsx");
    const i18n = read("src/i18n.ts");
    expect(page).toContain('className="shopify-catalog-toolbar"');
    expect(page).toContain('className="shopify-catalog-page shopify-catalog-list-page"');
    expect(page).toContain("filtersAlwaysInDrawer");
    expect(page).not.toContain('className="shopify-catalog-result-meta"');
    expect(page).toContain('className="shopify-catalog-table-block"');
    expect(page).toContain('className="page-heading shopify-catalog-heading"');
    expect(page).not.toContain('<strong>{t("shopifyCatalog.syncTitle")}</strong>');
    expect(page).not.toContain('<span>{t("shopifyCatalog.syncDescription")}</span>');
    expect(page).toContain('className="panel shopify-catalog-table-panel"');
    expect(page).toContain('className="shopify-catalog-table-wrap"');
    expect(i18n).not.toContain('pageOf: "第 {{page}} / {{total}} 頁"');
    expect(i18n).not.toContain('pageOf: "Page {{page}} of {{total}}"');
  });

  it("opens store and sync mode controls in a modal", () => {
    const page = read("src/components/ShopifyPendingProductsPage.tsx");
    const i18n = read("src/i18n.ts");
    expect(page).toContain("<Modal");
    expect(page).toContain('className="shopify-sync-form"');
    expect(page).toContain('className="shopify-sync-form-error"');
    expect(page).toContain('className="shopify-sync-log-trigger shopify-sync-modal-log-trigger"');
    expect(page).toContain('setSyncDialogOpen(true)');
    expect(i18n).toContain('sync: "同步"');
    expect(i18n).toContain('syncMode: "同步方式"');
  });

  it("opens recent sync runs and their errors in the shared side panel", () => {
    const page = read("src/components/ShopifyPendingProductsPage.tsx");
    const approvals = read("src/lib/shopify-product-approvals.ts");
    expect(page).toContain("<SidePanel");
    expect(page).toContain('className="shopify-sync-log-trigger shopify-sync-modal-log-trigger"');
    expect(page).toContain('className="shopify-sync-log-list"');
    expect(approvals).toContain("shopify_catalog_sync_errors(code,message,shopify_product_id,created_at)");
  });

  it("renders package choices with the same structured card layout as variants", () => {
    const detail = read("src/components/ShopifyPendingProductDetailPage.tsx");
    const styles = readAppStyles();
    expect(detail).toContain('className="panel shopify-package-panel"');
    expect(detail).toContain('className="shopify-section-card-header"');
    expect(detail).toContain('className="shopify-package-table-wrap"');
    expect(styles).toContain(".shopify-package-panel");
    expect(styles).toContain(".shopify-package-item-count");
  });

  it("lets reviewers add separate ingredient and packaging mappings", () => {
    const detail = read("src/components/ShopifyPendingProductDetailPage.tsx");
    const approvals = read("src/lib/shopify-product-approvals.ts");
    const styles = readAppStyles();
    expect(detail).toContain("<MaterialMappingCard");
    expect(detail).toContain('(["ingredient", "packing"] as const)');
    expect(approvals).toContain("fetchShopifyApprovalMaterialOptions");
    expect(approvals).toContain("approve_shopify_pending_catalog_item_with_materials");
    expect(styles).toContain(".shopify-material-grid");
  });

  it("uses a three-column product material grid and matching skeleton", () => {
    const detail = read("src/components/ProductDetailPage.tsx");
    const skeleton = read("src/components/ui/page-skeleton.tsx");
    const styles = readAppStyles();
    expect(detail).toContain('className="detail-grid product-material-grid"');
    expect(detail).toContain('detailLayout="product"');
    expect(skeleton).toContain("function productDetailSkeleton()");
    expect(skeleton).toContain('className="detail-grid product-material-grid product-material-grid-skeleton"');
    expect(styles).toContain(".product-material-grid");
  });
});
