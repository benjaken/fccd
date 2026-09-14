import { describe, expect, it } from "vitest";

import {
  customerServiceCatalogQuery,
  customerServiceCatalogSearchAnchor,
  isCustomerServiceCatalogRequest,
  rankCustomerServiceCatalog,
} from "../supabase/functions/_shared/customer-service-catalog.ts";

const candidates = [
  {
    id: "mid-autumn-4-6",
    sku: "CCMA0406",
    name: "【2026中秋】中秋團圓套餐 (4-6人)",
    price: 1680,
    channelName: "Catering",
  },
  {
    id: "mid-autumn-6-8",
    sku: "CCMA0608",
    name: "【2026中秋】中秋到會套餐 (6-8人)",
    price: 2080,
    channelName: "Catering",
  },
  {
    id: "old-mid-autumn-6",
    sku: "KCMA0601",
    name: "【2024中秋】秋蟹嚐鮮盛宴 (六位用)",
    price: 4288,
    channelName: "Kitchen",
  },
];

describe("customer-service catalog lookup", () => {
  it("recognizes Arabic and Chinese seasonal headcount ranges", () => {
    expect(isCustomerServiceCatalogRequest("中秋6-8")).toBe(true);
    expect(
      isCustomerServiceCatalogRequest(
        "打算訂中秋六至八人餐，請問有參考圖片及菜式嗎？",
      ),
    ).toBe(true);
    expect(customerServiceCatalogSearchAnchor("想睇中秋六至八人餐"))
      .toBe("中秋");
  });

  it("uses recent customer context for a short reference follow-up", () => {
    expect(
      customerServiceCatalogQuery("未有訂單，想參考", [
        { role: "customer", text: "中秋6-8" },
        { role: "assistant", text: "請提供日期或者人數。" },
      ]),
    ).toContain("中秋6-8");
  });

  it("selects the current package with the exact requested headcount range", () => {
    expect(rankCustomerServiceCatalog("中秋6-8", candidates, 2026)[0]?.id)
      .toBe("mid-autumn-6-8");
    expect(rankCustomerServiceCatalog("中秋4-6", candidates, 2026)[0]?.id)
      .toBe("mid-autumn-4-6");
  });
});
