import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyzeCustomerServiceImage,
  CUSTOMER_SERVICE_VISION_SYSTEM_PROMPT,
  customerServiceVisionConfig,
  customerServiceVisionOrderNumber,
  extractCustomerServiceVisionText,
  sanitizeCustomerServiceVisionResult,
} from "../supabase/functions/_shared/customer-service-vision.ts";

function stubEnv(entries: Record<string, string> = {}) {
  const values = new Map(Object.entries(entries));
  vi.stubGlobal("Deno", { env: { get: (name: string) => values.get(name) } });
}

afterEach(() => vi.unstubAllGlobals());

describe("customer-service vision config", () => {
  it("follows the customer-service AI switch and ignores report flags", () => {
    stubEnv({
      CUSTOMER_SERVICE_AI_ENABLED: "true",
      REPORT_AI_ENABLED: "true",
      SUPPLIER_QUOTE_AI_ENABLED: "true",
      ADDRESS_TRANSLATION_AI_ENABLED: "true",
      CUSTOMER_SERVICE_AI_API_KEY: "cs-key",
    });
    expect(customerServiceVisionConfig()).toMatchObject({
      enabled: true,
      apiKey: "cs-key",
      timeoutMs: 25_000,
      reasoningEffort: "low",
    });
  });

  it("does not turn on when only report or supplier-quote AI is enabled", () => {
    stubEnv({
      REPORT_AI_ENABLED: "true",
      SUPPLIER_QUOTE_AI_ENABLED: "true",
      REPORT_AI_API_KEY: "report-key",
    });
    const config = customerServiceVisionConfig();
    expect(config.enabled).toBe(false);
    expect(config.apiKey).toBe("");
  });

  it("defaults to low reasoning so grok-4.6 image calls can finish", () => {
    stubEnv({ CUSTOMER_SERVICE_AI_ENABLED: "true" });
    expect(customerServiceVisionConfig().reasoningEffort).toBe("low");
  });

  it("caps the timeout below the edge-function wall clock", () => {
    stubEnv({ CUSTOMER_SERVICE_VISION_TIMEOUT_MS: "60000" });
    expect(customerServiceVisionConfig().timeoutMs).toBe(45_000);
  });
});

describe("customer-service vision response parsing", () => {
  it("skips reasoning items and reads the message output_text", () => {
    expect(
      extractCustomerServiceVisionText({
        output: [
          { type: "reasoning", content: [{ type: "output_text", text: "thinking" }] },
          {
            type: "message",
            content: [{ type: "output_text", text: '{"mediaKind":"menu_product"}' }],
          },
        ],
      }),
    ).toBe('{"mediaKind":"menu_product"}');
  });
});

describe("customer-service vision analysis", () => {
  it("reuses a preview data URL and sends low reasoning_effort", async () => {
    stubEnv({
      CUSTOMER_SERVICE_AI_ENABLED: "true",
      CUSTOMER_SERVICE_AI_API_KEY: "cs-key",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    mediaKind: "menu_product",
                    extractedText: "椒鹽鮮魷",
                    entities: { productNames: ["椒鹽鮮魷"] },
                    summary: "餐牌產品圖",
                    confidence: 0.9,
                    needsHuman: false,
                    reason: "product page",
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await analyzeCustomerServiceImage(
      { imageUrl: "data:image/jpeg;base64,/9j/4AAQ", caption: "呢個幾錢" },
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toMatchObject({
      mediaKind: "menu_product",
      extractedText: "椒鹽鮮魷",
      confidence: 0.9,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.reasoning_effort).toBe("low");
    expect(request.max_output_tokens).toBe(1_200);
    expect(request.input[1].content[1].image_url).toBe(
      "data:image/jpeg;base64,/9j/4AAQ",
    );
    expect(request.input[0].content[0].text).toBe(
      CUSTOMER_SERVICE_VISION_SYSTEM_PROMPT,
    );
    expect(CUSTOMER_SERVICE_VISION_SYSTEM_PROMPT).toContain("CC0012-1");
    expect(CUSTOMER_SERVICE_VISION_SYSTEM_PROMPT).toContain("B-1550C");
    expect(CUSTOMER_SERVICE_VISION_SYSTEM_PROMPT).toContain(
      "never order numbers",
    );
  });

  it("rejects a product-page false order before returning", async () => {
    stubEnv({
      CUSTOMER_SERVICE_AI_ENABLED: "true",
      CUSTOMER_SERVICE_AI_API_KEY: "cs-key",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            mediaKind: "order_screenshot",
            extractedText: "CC0012-1 椒鹽鮮魷",
            entities: { orderNumber: "CC0012-1", productNames: ["椒鹽鮮魷"] },
            summary: "訂單截圖",
            confidence: 0.91,
            needsHuman: true,
            reason: "looks like an order",
          }),
        }),
        { status: 200 },
      ),
    );

    await expect(
      analyzeCustomerServiceImage(
        { imageUrl: "data:image/jpeg;base64,/9j/4AAQ" },
        fetchMock as unknown as typeof fetch,
      ),
    ).resolves.toMatchObject({
      mediaKind: "menu_product",
      entities: { orderNumber: null },
      needsHuman: false,
    });
  });
});

describe("customer-service vision order-number guard", () => {
  it("only keeps existing FCCD order-number formats", () => {
    expect(
      customerServiceVisionOrderNumber({
        entities: { orderNumber: " B-1550C " },
        extractedText: "",
      }),
    ).toBe("B-1550C");
    expect(
      customerServiceVisionOrderNumber({
        entities: { orderNumber: "CC0012-1" },
        extractedText: "ECO006-1 加入購物車",
      }),
    ).toBe("");
  });

  it("reclassifies a product image that the model labelled as an order", () => {
    expect(
      sanitizeCustomerServiceVisionResult({
        mediaKind: "order_screenshot",
        extractedText: "CC0012-1 椒鹽鮮魷 加入購物車",
        entities: { orderNumber: "CC0012-1", productNames: ["椒鹽鮮魷"] },
        summary: "訂單",
        confidence: 0.9,
        needsHuman: true,
        reason: "order",
      }),
    ).toMatchObject({
      mediaKind: "menu_product",
      entities: { orderNumber: null },
      needsHuman: false,
    });
  });

  it("keeps a real order screenshot when the number matches the system format", () => {
    expect(
      sanitizeCustomerServiceVisionResult({
        mediaKind: "order_screenshot",
        extractedText: "訂單 B-1550C 已確認",
        entities: { orderNumber: "B-1550C" },
        summary: "訂單確認",
        confidence: 0.94,
        needsHuman: true,
        reason: "confirmation",
      }),
    ).toMatchObject({
      mediaKind: "order_screenshot",
      entities: { orderNumber: "B-1550C" },
      needsHuman: true,
    });
  });
});
