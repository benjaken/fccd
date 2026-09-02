import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import { DeliveryAddressActions } from "../src/components/DeliveryAddressActions";
import { DistrictTranslationButton } from "../src/components/DistrictTranslationButton";
import { googleMapsEmbedUrl, googleMapsSearchUrl } from "../src/lib/address-tools";
import { containsEnglishText } from "../supabase/functions/_shared/location-translation";

describe("delivery address tools", () => {
  it("builds a Google Maps search URL from the current address", () => {
    expect(googleMapsSearchUrl("  12 Queen's Road Central, HK  ")).toBe(
      "https://www.google.com/maps/search/?api=1&query=12%20Queen's%20Road%20Central%2C%20HK",
    );
    expect(googleMapsSearchUrl("  ")).toBe("");
    expect(googleMapsEmbedUrl("  12 Queen's Road Central, HK  ")).toBe(
      "https://www.google.com/maps?q=12%20Queen's%20Road%20Central%2C%20HK&output=embed",
    );
  });

  it("replaces the address only after AI translation succeeds", async () => {
    const onTranslated = vi.fn();
    const translateAddress = vi.fn().mockResolvedValue("香港皇后大道中12號");
    render(
      <DeliveryAddressActions
        address="12 Queen's Road Central, HK"
        onTranslated={onTranslated}
        translateAddress={translateAddress}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "AI 翻譯成繁體中文" }));
    await waitFor(() => expect(onTranslated).toHaveBeenCalledWith("香港皇后大道中12號"));
    expect(translateAddress).toHaveBeenCalledWith("12 Queen's Road Central, HK");
  });

  it("keeps actions disabled when the address is empty", () => {
    render(<DeliveryAddressActions address=" " onTranslated={vi.fn()} />);
    expect(screen.getByRole("button", { name: "AI 翻譯成繁體中文" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Google 地圖定位" })).toBeDisabled();
  });

  it("shows Google Maps in a dialog instead of opening a new page", () => {
    render(<DeliveryAddressActions address="1 Queen's Road Central" onTranslated={vi.fn()} />);
    const mapButton = screen.getByRole("button", { name: "Google 地圖定位" });
    expect(mapButton).toHaveAttribute("title", "Google 地圖定位");
    fireEvent.click(mapButton);

    expect(screen.getByRole("dialog", { name: "Google 地圖定位" })).toBeInTheDocument();
    const mapFrame = screen.getAllByTitle("Google 地圖定位")
      .find((element) => element.tagName === "IFRAME");
    expect(mapFrame).toHaveAttribute(
      "src",
      "https://www.google.com/maps?q=1%20Queen's%20Road%20Central&output=embed",
    );
  });

  it("detects English location text before automatic Shopify translation", () => {
    expect(containsEnglishText("Central, Hong Kong")).toBe(true);
    expect(containsEnglishText("香港中環皇后大道中12號")).toBe(false);
    expect(containsEnglishText("香港中環 Block 2")).toBe(true);
  });

  it("translates a selected district and returns it to the editor", async () => {
    const onTranslated = vi.fn();
    const translateDistrict = vi.fn().mockResolvedValue("中環");
    render(
      <DistrictTranslationButton
        district="Central"
        onTranslated={onTranslated}
        translateDistrict={translateDistrict}
      />,
    );

    const translateButton = screen.getByRole("button", { name: "AI 翻譯" });
    expect(translateButton).toHaveAttribute("title", "AI 翻譯");
    fireEvent.click(translateButton);
    await waitFor(() => expect(onTranslated).toHaveBeenCalledWith("中環"));
    expect(translateDistrict).toHaveBeenCalledWith("Central");
  });

  it("translates Shopify locations before resolving the district lookup", () => {
    const source = readFileSync("supabase/functions/shopify-order-sync/index.ts", "utf8");
    const translate = source.indexOf("await translateShopifyLocations(mapped)");
    const resolveDistrict = source.indexOf("resolveShopifyDistrictId(item.districtSources");
    expect(translate).toBeGreaterThan(-1);
    expect(resolveDistrict).toBeGreaterThan(translate);
    expect(source).toContain("item.orderRow.shipping_address_snapshot = value(address, \"address\")");
  });
});
