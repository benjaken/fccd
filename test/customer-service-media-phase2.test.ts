import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const webhook = readFileSync(
  "supabase/functions/wati-customer-service/index.ts",
  "utf8",
);
const ragRuntime = readFileSync(
  "supabase/functions/_shared/customer-service-rag-runtime.ts",
  "utf8",
);

describe("customer service media phase 2 routing", () => {
  it("routes inbound images before falling back to handoff", () => {
    expect(webhook).toContain("decideCustomerServiceMediaRoute");
    expect(webhook).toContain('route.action === "menu"');
    expect(webhook).toContain('route.action === "order"');
    expect(webhook).toContain('return "handoff";');
  });

  it("answers menu images from the published menu FAQ", () => {
    expect(webhook).toContain("loadCustomerServiceMenuImageReply");
    expect(webhook).toContain("search_published_customer_faqs");
    expect(webhook).toContain('intentKey: "media_menu"');
  });

  it("links a menu image to a Shopify product when the dish names resolve", () => {
    expect(webhook).toContain("loadCustomerServiceMenuProductReply");
    expect(webhook).toContain("search_order_intake_catalog");
    expect(webhook).toContain("customerServiceMenuProductMatches");
    expect(webhook).toContain('toolKeys: menuResolution.restricted');
  });

  it("resolves a recognised product code to its product page", () => {
    expect(webhook).toContain("loadCustomerServiceMenuSkuReply");
    expect(webhook).toContain("shopify_catalog_draft_variants");
    expect(webhook).toContain("shopify_catalog_mappings");
    expect(webhook).toContain("shopify_catalog_drafts");
    expect(webhook).toContain("customerServiceShopifyProductUrl");
    expect(webhook).toContain("customerServiceExactSkuFilter");
    expect(webhook).toContain("customerServiceSkuProductsForBrand");
    expect(webhook).not.toContain('.ilike("sku", `%${code}%`)');
    expect(webhook).toContain("entities?.productCode");
    expect(webhook).toContain('product_source: skuReply');
  });

  it("degrades hybrid retrieval when either side fails", () => {
    expect(webhook).toContain("createCustomerServiceFaqRagDeps");
    expect(ragRuntime).toContain('code:"lexical_error"');
    expect(ragRuntime).toContain('code:"vector_error"');
    expect(ragRuntime).toContain("CustomerServiceRetrievalError");
  });

  it("checks block dates for a menu image and asks for the date when unknown", () => {
    expect(webhook).toContain("resolveCustomerServiceMenuImageReply");
    expect(webhook).toContain("checkOrderIntakeAvailability");
    expect(webhook).toContain("orderIntakeAvailabilityReply");
    expect(webhook).toContain("menuImageDeliveryDate");
    expect(webhook).toContain("請提供送貨日期，我可以即時幫你確認該日供應。");
    expect(webhook).toContain("menu_image_blocked_date");
  });

  it("re-runs an order screenshot turn with the image order number, phone scoped", () => {
    expect(webhook).toContain("const orderNumber = route.orderNumber;");
    expect(webhook).toContain("baseResult.orderNumber");
    expect(webhook).toContain("{ ...baseResult, orderNumber }");
  });

  it("queues inbound media off the webhook request", () => {
    expect(webhook).toContain("media_type: event.type");
    expect(webhook).toContain("deferBackground(");
    expect(webhook).toContain("handleInboundMedia(admin, event)");
    expect(webhook).toContain("queued: true");
    expect(webhook).not.toContain("handoff: route === \"handoff\"");
  });

  it("runs vision from downloaded image bytes even if storage mirroring fails", () => {
    expect(webhook).toContain("downloadTrustedInboundMedia");
    expect(webhook).toContain("mirrored?.dataUrl");
    expect(webhook).toContain("customer_service_media_upload_failed");
    expect(webhook).toContain("customer_service_media_untrusted_url");
  });
});
