import { describe, expect, it } from "vitest";
import {
  INTERNAL_WATI_TEMPLATE_DEFAULTS,
  resolveInternalWatiTemplate,
} from "../supabase/functions/_shared/wati-internal-template-config.ts";

describe("internal WATI template configuration", () => {
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
