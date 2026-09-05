import { describe, expect, it } from "vitest";

import {
  assessCustomerServiceAdvertisement,
  isCustomerServiceMediaType,
} from "../supabase/functions/_shared/customer-service-spam.ts";

describe("customer service spam filter", () => {
  it("filters clear promotional spam", () => {
    const result = assessCustomerServiceAdvertisement(
      "SEO 廣告投放及引流獲客限時優惠，WhatsApp 91234567 聯絡",
    );
    expect(result.isAdvertisement).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.8);
  });

  it("does not classify customer catering questions or a media URL as advertising", () => {
    expect(assessCustomerServiceAdvertisement("我想訂30人到會，有冇優惠？").isAdvertisement)
      .toBe(false);
    expect(assessCustomerServiceAdvertisement(
      "https://live-mt-server.wati.io/2552/api/file/showFile?fileName=data/audios/test.opus",
    ).isAdvertisement).toBe(false);
  });

  it("recognises only supported media handoff types", () => {
    expect(isCustomerServiceMediaType("image")).toBe(true);
    expect(isCustomerServiceMediaType("voice")).toBe(true);
    expect(isCustomerServiceMediaType("audio")).toBe(true);
    expect(isCustomerServiceMediaType("text")).toBe(false);
    expect(isCustomerServiceMediaType("document")).toBe(false);
  });
});
