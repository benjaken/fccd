import { describe, expect, it } from "vitest";

import {
  canonicalCatalogJson,
  catalogChangeDiff,
  isShopifyOptionHelperProduct,
  normalizeCatalogProduct,
  parseGloboPackageSchema,
  parsePackageSchema,
  resolveShopDomain,
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

  it("extracts applicable Globo option groups as configurable package children", () => {
    const html = `<script>
      window.GPOConfigs.options[1260252] = {"elements":[{"id":"group-1","type":"group","elements":[
        {"id":"checkbox-2","type":"checkbox","label":"中式小菜 7選4","min":"4","max":"4","required":true,"option_values":[
          {"name":1,"value":"脆皮吊燒雞 (1隻)"},
          {"name":2,"value":"當紅川味辣子雞 (1隻)","variant_id":42040919752791,"variant_price":"40.00"}
        ]}
      ]}],"products":{"rule":{"manual":{"enable":true,"ids":[7295387107415]}}}};
      window.GPOConfigs.options[735786] = {"elements":[
        {"id":"checkbox-old","type":"checkbox","label":"舊版選項","option_values":[{"value":"Legacy"}]}
      ],"products":{"rule":{"manual":{"enable":true,"ids":[7295387107415]}}}};
      window.GPOConfigs.options[999] = {"elements":[{"id":"checkbox-1","option_values":[{"value":"Other"}]}],"products":{"rule":{"manual":{"enable":true,"ids":[123]}}}};
    </script>`;
    const schema = parseGloboPackageSchema(html, 7295387107415);
    const result = normalizeCatalogProduct(baseProduct, { packageSchema: schema });

    expect(schema?.groups).toHaveLength(1);
    expect(result.catalogType).toBe("configurable_package");
    expect(result.choiceSets[0]).toMatchObject({
      name: "中式小菜 7選4",
      minimumChoices: 4,
      maximumChoices: 4,
    });
    expect(result.packageItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "脆皮吊燒雞 (1隻)", addonPrice: 0 }),
      expect.objectContaining({ name: "當紅川味辣子雞 (1隻)", childVariantId: 42040919752791, addonPrice: 40 }),
    ]));
  });

  it("captures Globo direct add-on prices and surcharges written in option labels", () => {
    const html = `<script>
      window.GPOConfigs.options[1195855] = {"elements":[
        {"id":"checkbox-2","type":"checkbox","label":"中式小菜 4選2","min":"2","max":"2","required":true,"option_values":[
          {"name":1,"value":"川式涼拌青瓜魚片 (1磅)"},
          {"name":2,"value":"中秋三味乳鴿皇 (紅燒、麻辣、花雕共3隻) [ $40.00 ]","price":"40.00"},
          {"name":3,"value":"薑蔥霸王雞 (1隻)","addon":"40"}
        ]}
      ],"products":{"rule":{"manual":{"enable":true,"ids":[6962418974887]}}}};
    </script>`;
    const schema = parseGloboPackageSchema(html, 6962418974887);
    expect(schema?.groups?.[0]?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "中秋三味乳鴿皇 (紅燒、麻辣、花雕共3隻)", addon_price: 40 }),
      expect.objectContaining({ name: "薑蔥霸王雞 (1隻)", addon_price: 40 }),
    ]));
  });

  it("falls back to the stored shop domain when the configured secret is invalid", () => {
    expect(resolveShopDomain("https://", "valid-store.myshopify.com"))
      .toBe("valid-store.myshopify.com");
    expect(resolveShopDomain("https://preferred.myshopify.com/", "fallback.myshopify.com"))
      .toBe("preferred.myshopify.com");
  });

  it("recognizes Globo option helper products that must not enter the formal catalog", () => {
    expect(isShopifyOptionHelperProduct({
      id: 7471358967895,
      title: "中式小菜 3選1",
      handle: "chinese-side-dishes",
      tags: "non-cny",
    })).toBe(true);
    expect(isShopifyOptionHelperProduct({
      id: 7471358967896,
      title: "分享小食（７ 選 ３）",
    })).toBe(true);
    expect(isShopifyOptionHelperProduct(baseProduct)).toBe(false);
    expect(isShopifyOptionHelperProduct({
      id: 7471358967897,
      title: "三選一雜錦小食拼盤",
    })).toBe(false);
  });
});
