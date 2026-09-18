import { afterEach, describe, expect, it, vi } from "vitest";

import { customerServiceVisionConfig } from "../supabase/functions/_shared/customer-service-vision.ts";

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
      timeoutMs: 12_000,
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

  it("caps the timeout so inbound webhooks cannot hang", () => {
    stubEnv({ CUSTOMER_SERVICE_VISION_TIMEOUT_MS: "60000" });
    expect(customerServiceVisionConfig().timeoutMs).toBe(15_000);
  });
});
