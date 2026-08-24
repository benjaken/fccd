import { describe, expect, it } from "vitest";

import {
  FOOD_CHANNEL_CATERING_LOGO_PATH,
  FOOD_CHANNEL_KITCHEN_LOGO_PATH,
  FC_CUISINE_LOGO_PATH,
  HK_LUNCH_BOX_LOGO_PATH,
  HK_PARTY_FOOD_LOGO_PATH,
  getBrandContactEmail,
  getDocumentLogoPath,
  getBrandLogoAlt,
} from "@/lib/brand-logo";

describe("brand logo selection", () => {
  it("uses Food Channel Catering as the default", () => {
    expect(getDocumentLogoPath()).toBe(FOOD_CHANNEL_CATERING_LOGO_PATH);
    expect(getDocumentLogoPath("Catering")).toBe(
      FOOD_CHANNEL_CATERING_LOGO_PATH,
    );
  });

  it("uses the Lunch Box logo for Lunch Box documents", () => {
    expect(getDocumentLogoPath("HK lunch box")).toBe(HK_LUNCH_BOX_LOGO_PATH);
    expect(getDocumentLogoPath("Catering", "FCBQ20260828")).toBe(HK_LUNCH_BOX_LOGO_PATH);
    expect(getDocumentLogoPath("Catering", "hklunchbox.myshopify.com")).toBe(
      HK_LUNCH_BOX_LOGO_PATH,
    );
  });

  it("uses the Party Food logo for Party Food documents", () => {
    expect(getDocumentLogoPath("hkpartyfood.com")).toBe(
      HK_PARTY_FOOD_LOGO_PATH,
    );
  });

  it("uses the FCK logo for Kitchen documents", () => {
    expect(getDocumentLogoPath("Food Channels Kitchen")).toBe(
      FOOD_CHANNEL_KITCHEN_LOGO_PATH,
    );
  });

  it("maps 福滿樓 and Cuisine to the FC Cuisine logo", () => {
    expect(getDocumentLogoPath("福滿樓")).toBe(FC_CUISINE_LOGO_PATH);
    expect(getDocumentLogoPath("FC Cuisine")).toBe(FC_CUISINE_LOGO_PATH);
    expect(getBrandLogoAlt("福滿樓")).toBe("FC Cuisine 福滿樓");
  });

  it("uses the configured brand email before the brand fallback", () => {
    expect(getBrandContactEmail(" quotes@example.com ", "HK lunch box")).toBe("quotes@example.com");
    expect(getBrandContactEmail(null, "HK lunch box")).toBe("sales@hklunchbox.com");
    expect(getBrandContactEmail(null, "hkpartyfood.com")).toBe("sales@hkpartyfood.com");
    expect(getBrandContactEmail(null, "Food Channels Kitchen")).toBe("sales@foodchannels-kitchen.com");
    expect(getBrandContactEmail(null, "FC Cuisine")).toBe("sales@foodchannels-cuisine.com");
    expect(getBrandContactEmail(null, "Catering")).toBe("sales@foodchannels-catering.com");
  });
});
