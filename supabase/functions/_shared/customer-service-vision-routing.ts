import { extractOrderNumber } from "./customer-service-intents.ts";
import type { CustomerServiceVisionResult } from "./customer-service-vision.ts";

/**
 * Phase 2 media routing.
 *
 * Vision already classifies an inbound image. This decides whether the turn can
 * be answered from trusted data instead of always handing the customer to a
 * human:
 * - a confident menu/product image is answered with the published menu links,
 * - an order screenshot carrying an order number re-enters the normal order
 *   lookup/handoff turn (the number must still match the sender's phone),
 * - every other image (payment, complaint, address, unclear, low confidence)
 *   keeps the existing human handoff behaviour.
 */
export const CUSTOMER_SERVICE_MENU_IMAGE_MIN_CONFIDENCE = 0.65;

export type CustomerServiceMediaRoute =
  | { action: "menu" }
  | { action: "order"; orderNumber: string }
  | { action: "handoff" };

export function decideCustomerServiceMediaRoute(
  vision: CustomerServiceVisionResult | null,
): CustomerServiceMediaRoute {
  if (!vision) return { action: "handoff" };

  if (
    vision.mediaKind === "menu_product" &&
    !vision.needsHuman &&
    vision.confidence >= CUSTOMER_SERVICE_MENU_IMAGE_MIN_CONFIDENCE
  ) {
    return { action: "menu" };
  }

  if (vision.mediaKind === "order_screenshot") {
    const entityOrderNumber = vision.entities?.orderNumber?.trim() ?? "";
    const orderNumber = entityOrderNumber || extractOrderNumber(vision.extractedText ?? "");
    if (orderNumber) return { action: "order", orderNumber };
  }

  return { action: "handoff" };
}

/**
 * Brand menu links used when a menu image is answered. Kept here so the reply
 * always carries real ordering links even if the published FAQ lookup fails.
 */
export const CUSTOMER_SERVICE_BRAND_MENU_LINKS = [
  "Food Channels Catering（中西式到會、套餐及單點）：https://foodchannels-catering.com/",
  "Food Channels Express（即日自選到會）：https://www.foodchannels-express.com/",
  "HK Lunch Box（飯盒及便當）：https://hklunchbox.com/",
  "HK Party Food（派對套餐及一口小食）：https://www.hkpartyfood.com/",
  "Food Channels Kitchen（高級中式到會）：https://foodchannels-kitchen.com/",
  "Food Channels Cuisine（養生中菜到會）：https://www.foodchannels-cuisine.com/",
] as const;

export function customerServiceMenuImageReplyText(
  links: readonly string[] = CUSTOMER_SERVICE_BRAND_MENU_LINKS,
) {
  const list = links.length ? [...links] : [...CUSTOMER_SERVICE_BRAND_MENU_LINKS];
  return [
    "你好，以下品牌網站可以直接查看餐牌同落單：",
    ...list.map((line) => `• ${line}`),
    "",
    "實際供應以網站當日顯示為準。如果想搵特定套餐，可以話我知活動日期、人數、地區同預算，我幫你揀合適餐牌。",
  ].join("\n");
}

/** Extracts brand-name menu links from published brand menu FAQs. */
export function customerServiceBrandMenuLinks(
  rows: ReadonlyArray<{ question?: string | null; answer?: string | null }>,
) {
  const links = rows.flatMap((row) => {
    const question = String(row.question ?? "").trim();
    const brand = question.match(/^(.+?)\s*有冇餐牌可以睇[？?]?$/)?.[1]?.trim();
    const url = String(row.answer ?? "").match(/https?:\/\/[^\s]+/)?.[0];
    if (!brand || !url) return [];
    return [`${brand}：${url}`];
  });
  return [...new Set(links)];
}

// Explicit brand names are checked before generic category words so an image
// that mentions both (for example a Catering menu showing 飯盒 packaging) maps
// to the named brand instead of an unrelated brand by category.
const CUSTOMER_SERVICE_MENU_BRAND_PATTERNS = [
  { brand: "HK Lunch Box", pattern: /(?:hk\s*lunch\s*box|hklunchbox)/i },
  { brand: "HK Party Food", pattern: /(?:hk\s*party\s*food|hkpartyfood)/i },
  {
    brand: "Food Channels Express",
    pattern: /(?:food\s*channels?\s*express|fc\s*express)/i,
  },
  {
    brand: "Food Channels Kitchen",
    pattern: /(?:food\s*channels?\s*kitchen|fc\s*kitchen|桂花[‧·・．.]?八月)/i,
  },
  {
    brand: "Food Channels Cuisine",
    pattern: /(?:food\s*channels?\s*cuisine|fc\s*cuisine|福滿樓|福满楼)/i,
  },
  {
    brand: "Food Channels Catering",
    pattern: /(?:food\s*channels?\s*catering|fc\s*catering|\bfcc\b)/i,
  },
  { brand: "HK Lunch Box", pattern: /(?:飯盒|便當|便当|餐盒|meal\s*box)/i },
  { brand: "HK Party Food", pattern: /(?:派對|派对|一口小食|canap)/i },
  { brand: "Food Channels Express", pattern: /(?:即日|現貨|现货)/i },
  { brand: "Food Channels Catering", pattern: /(?:到會|到会|自助餐)/i },
] as const;

export function customerServiceMenuImageBrand(text: string) {
  const body = text.trim();
  if (!body) return "";
  return CUSTOMER_SERVICE_MENU_BRAND_PATTERNS.find(({ pattern }) =>
    pattern.test(body)
  )?.brand ?? "";
}

export function customerServiceMenuImageBrandLink(brand: string) {
  return CUSTOMER_SERVICE_BRAND_MENU_LINKS.find((line) =>
    line.startsWith(brand) && line.includes("：")
  ) ?? "";
}

export type CustomerServiceMenuProduct = {
  name: string;
  productUrl: string;
};

const CUSTOMER_SERVICE_BRAND_URL_TOKENS: Array<{
  brand: string;
  token: RegExp;
}> = [
  { brand: "HK Lunch Box", token: /lunch|hklunchbox/i },
  { brand: "HK Party Food", token: /party/i },
  { brand: "Food Channels Express", token: /express/i },
  { brand: "Food Channels Kitchen", token: /kitchen/i },
  { brand: "Food Channels Cuisine", token: /cuisine|fuman|福滿|福满/i },
  { brand: "Food Channels Catering", token: /catering/i },
];

function customerServiceBrandUrlToken(brand: string) {
  return CUSTOMER_SERVICE_BRAND_URL_TOKENS.find((entry) =>
    entry.brand === brand
  )?.token;
}

export function customerServiceMenuUrlMatchesBrand(
  productUrl: string,
  brand: string,
) {
  if (!brand) return true;
  const token = customerServiceBrandUrlToken(brand);
  return token ? token.test(productUrl) : true;
}

export function customerServiceMenuBrandFromUrl(productUrl: string) {
  return CUSTOMER_SERVICE_BRAND_URL_TOKENS.find((entry) =>
    entry.token.test(productUrl)
  )?.brand ?? "";
}

/** Public site URL for a Shopify store domain + product handle. */
export function customerServiceShopifyProductUrl(
  shopDomain: string,
  handle: string,
) {
  const domain = shopDomain.trim().replace(/^https?:\/\//, "");
  const cleanHandle = handle.trim();
  if (!domain || !cleanHandle) return "";
  const publicDomain = domain === "foodchannels-catering.myshopify.com"
    ? "foodchannels-catering.com"
    : domain === "foodchannels-kitchen.myshopify.com"
    ? "foodchannels-kitchen.com"
    : domain === "hk-party-food.myshopify.com"
    ? "www.hkpartyfood.com"
    : domain === "foodchannels-express.myshopify.com"
    ? "www.foodchannels-express.com"
    : domain === "hklunchbox.myshopify.com"
    ? "hklunchbox.com"
    : domain;
  return `https://${publicDomain}/products/${encodeURIComponent(cleanHandle)}`;
}

/** Rewrites a catalog product URL to its public storefront domain. */
export function customerServicePublicProductUrl(productUrl: string) {
  const raw = productUrl.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const handle = url.pathname.split("/").filter(Boolean).pop() ?? "";
    return customerServiceShopifyProductUrl(url.hostname, handle) || raw;
  } catch {
    return raw;
  }
}

/**
 * Keeps only product hits whose title contains one of the OCR/product terms and,
 * when the brand is known, whose URL belongs to that brand. This is the guard
 * that stops a menu image from linking an unrelated brand's product.
 */
export function customerServiceMenuProductMatches(
  terms: readonly string[],
  hits: ReadonlyArray<{ name?: string | null; product_url?: string | null }>,
  brand = "",
  limit = 3,
): CustomerServiceMenuProduct[] {
  const cleaned = terms.map((term) => term.trim()).filter((term) =>
    term.length >= 2
  );
  if (!cleaned.length || limit <= 0) return [];
  const results: CustomerServiceMenuProduct[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    const name = String(hit.name ?? "").trim();
    const productUrl = String(hit.product_url ?? "").trim();
    if (!name || !productUrl || seen.has(productUrl)) continue;
    if (!customerServiceMenuUrlMatchesBrand(productUrl, brand)) continue;
    if (!cleaned.some((term) => name.includes(term))) continue;
    seen.add(productUrl);
    results.push({ name, productUrl });
    if (results.length >= limit) break;
  }
  return results;
}

/** Case-insensitive exact SKU match. Rejects LIKE wildcards from OCR. */
export function customerServiceExactSkuFilter(sku: string) {
  const code = sku.trim();
  if (code.length < 3 || code.length > 64) return "";
  if (/[%_*?]/.test(code)) return "";
  return code;
}

export function customerServiceSkuProductsForBrand(
  products: readonly CustomerServiceMenuProduct[],
  brand: string,
  limit = 3,
): CustomerServiceMenuProduct[] {
  const filtered = brand
    ? products.filter((product) =>
      customerServiceMenuUrlMatchesBrand(product.productUrl, brand)
    )
    : [...products];
  return filtered.slice(0, Math.max(0, limit));
}

export function customerServiceMenuProductReplyText(
  products: readonly CustomerServiceMenuProduct[],
  brand = "",
) {
  if (!products.length) return "";
  const lines = ["你講嘅應該係："];
  for (const product of products) {
    lines.push(`• ${product.name}：${product.productUrl}`);
  }
  if (brand) lines.push(`（${brand}）`);
  lines.push(
    "實際供應以網站當日顯示為準。如果想訂或者想睇更多選擇，可以話我知活動日期、人數、地區同預算。",
  );
  return lines.join("\n");
}
