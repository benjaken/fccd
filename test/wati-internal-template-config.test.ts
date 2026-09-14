import { describe, expect, it } from "vitest";
import {
  INTERNAL_WATI_TEMPLATE_DEFAULTS,
  numberedInternalWatiParameters,
  resolveInternalWatiTemplate,
} from "../supabase/functions/_shared/wati-internal-template-config.ts";

describe("internal WATI template configuration", () => {
  it("maps numbered Meta placeholders and sanitizes every value", () => {
    expect(numberedInternalWatiParameters([
      "HK Lunch Box",
      "B-1222",
      "陳生\n VIP",
      "",
      "17:00",
      "倫敦道",
      "https://example.com/order",
    ])).toEqual([
      { name: "1", value: "HK Lunch Box" },
      { name: "2", value: "B-1222" },
      { name: "3", value: "陳生 VIP" },
      { name: "4", value: "-" },
      { name: "5", value: "17:00" },
      { name: "6", value: "倫敦道" },
      { name: "7", value: "https://example.com/order" },
    ]);
  });

  it("provides defaults for every internal template", () => {
    expect(resolveInternalWatiTemplate("shopifyNewOrder", () => undefined)).toEqual({
      template_name: "fccd_internal_shopify_new_order",
      broadcast_name: "FCCD internal Shopify new order",
    });
    expect(resolveInternalWatiTemplate("orderReadinessIssue", () => undefined)).toEqual({
      template_name: "fccd_internal_order_readiness_issue",
      broadcast_name: "Internal order readiness issue",
    });

    expect(Object.keys(INTERNAL_WATI_TEMPLATE_DEFAULTS)).toHaveLength(7);
    for (const definition of Object.values(INTERNAL_WATI_TEMPLATE_DEFAULTS)) {
      expect(definition.templateName).toBeTruthy();
      expect(definition.broadcastName).toBeTruthy();
    }
  });

  it("uses trimmed Supabase Secret overrides when configured", () => {
    const values: Record<string, string> = {
      WATI_SHOPIFY_NEW_ORDER_TEMPLATE_NAME: " custom_shopify ",
      WATI_SHOPIFY_NEW_ORDER_BROADCAST_NAME: " Custom Shopify Broadcast ",
    };

    expect(resolveInternalWatiTemplate("shopifyNewOrder", (name) => values[name])).toEqual({
      template_name: "custom_shopify",
      broadcast_name: "Custom Shopify Broadcast",
    });
  });

  it("falls back independently when only one override is present", () => {
    expect(resolveInternalWatiTemplate("reconciliationMissing", (name) =>
      name === "WATI_ORDER_RECONCILIATION_MISSING_TEMPLATE_NAME" ? "approved_name" : undefined
    )).toEqual({
      template_name: "approved_name",
      broadcast_name: "FCCD internal missing order",
    });
  });
});
