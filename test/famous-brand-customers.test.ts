import { describe, expect, it } from "vitest";

import { aggregateFamousBrandCustomers } from "@/lib/famous-brand-customers";

describe("famous brand customers", () => {
  it("groups marked quotes by company and uses the customer when company is absent", () => {
    const result = aggregateFamousBrandCustomers([
      {
        id: "q-2",
        order_number: "Q002",
        customer_name_snapshot: "Amy",
        company_name_snapshot: "Hang Seng Bank",
        grand_total: 12000,
        currency: "HKD",
        quote_status: "Done Deal",
        updated_at: "2026-08-31T02:00:00Z",
      },
      {
        id: "q-1",
        order_number: "Q001",
        customer_name_snapshot: "Amy",
        company_name_snapshot: "hang seng bank",
        grand_total: 8000,
        currency: "HKD",
        quote_status: "50%",
        updated_at: "2026-08-30T02:00:00Z",
      },
      {
        id: "q-3",
        order_number: "Q003",
        customer_name_snapshot: "Hong Kong Design Centre",
        company_name_snapshot: null,
        grand_total: null,
        currency: "HKD",
        quote_status: "Done Deal",
        updated_at: "2026-08-29T02:00:00Z",
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      brandName: "Hang Seng Bank",
      quoteCount: 2,
      openQuoteCount: 1,
      doneDealCount: 1,
      totalAmount: 20000,
      latestQuoteId: "q-2",
    });
    expect(result[1]).toMatchObject({
      brandName: "Hong Kong Design Centre",
      quoteCount: 1,
      openQuoteCount: 0,
      doneDealCount: 1,
      totalAmount: 0,
    });
  });
});
