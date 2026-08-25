import { describe, expect, it } from "vitest";

import {
  canonicalCatalogJson,
  catalogChangeDiff,
  normalizeCatalogProduct,
  parsePackageSchema,
} from "../supabase/functions/shopify-product-sync/map";

const baseProduct = {
  id: 100,
  title: "Lunch Set",
  status: "active",
  tags: "lunch, featured",
  variants: [
    { id: 1001, title: "Default Title", sku: "SET-100", price: "88.00" },
  ],
};

describe("Shopify product catalog mapping", () => {
  it("normalizes an ordinary product and keeps its variants", () => {
    const result = normalizeCatalogProduct(baseProduct);

    expect(result.catalogType).toBe("product");
    expect(result.tags).toEqual(["lunch", "featured"]);
    expect(result.variants[0]).toMatchObject({
      shopifyVariantId: 1001,
      sku: "SET-100",
      price: 88,
    });
  });

  it("maps Shopify fixed bundle components to required package children", () => {
    const result = normalizeCatalogProduct(baseProduct, {
      fixedComponents: [
        { key: "rice", variantId: 2001, productId: 200, sku: "RICE-1", name: "Rice", quantity: 2 },
      ],
      variantRequiresComponents: { "1001": true },
    });

    expect(result.catalogType).toBe("fixed_package");
    expect(result.packageItems[0]).toMatchObject({
      childVariantId: 2001,
      sku: "RICE-1",
      quantity: 2,
      isRequired: true,
    });
    expect(result.variants[0].requiresComponents).toBe(true);
  });

  it("maps configurable groups, limits, quantities, and add-on prices", () => {
    const schema = {
      version: 1,
      type: "configurable_package",
      groups: [{
        code: "main",
        name: "Main course",
        min: 1,
        max: 2,
        items: [{ variant_id: "gid://shopify/ProductVariant/3001", sku: "MAIN-1", quantity: 1, addon_price: 10 }],
      }],
    };
    const result = normalizeCatalogProduct(baseProduct, { packageSchema: JSON.stringify(schema) });

    expect(parsePackageSchema(schema)).not.toBeNull();
    expect(result.catalogType).toBe("configurable_package");
    expect(result.choiceSets[0]).toMatchObject({ externalKey: "main", minimumChoices: 1, maximumChoices: 2 });
    expect(result.packageItems[0]).toMatchObject({ childVariantId: 3001, addonPrice: 10, choiceSetKey: "main" });
  });

  it("produces stable fingerprints and field-level change evidence", () => {
    expect(canonicalCatalogJson({ b: 2, a: 1 })).toBe(canonicalCatalogJson({ a: 1, b: 2 }));
    expect(catalogChangeDiff({ title: "Old", price: 10 }, { title: "New", price: 10 }))
      .toEqual({ title: { before: "Old", after: "New" } });
  });
});
