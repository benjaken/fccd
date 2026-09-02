import { describe, expect, it } from "vitest";

import { aggregateFamousBrandCustomers } from "@/lib/famous-brand-customers";

describe("famous brand customers", () => {
  it("groups marked orders by company and excludes rows without a company", () => {
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

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      brandName: "Hang Seng Bank",
      quoteCount: 2,
      openQuoteCount: 1,
      doneDealCount: 1,
      totalAmount: 20000,
      latestQuoteId: "q-2",
    });
    expect(result[0]?.orders.map((order) => order.id)).toEqual(["q-2", "q-1"]);
  });

  it("sorts customers by order count before the latest update", () => {
    const result = aggregateFamousBrandCustomers([
      {
        id: "recent-single",
        order_number: "Q100",
        customer_name_snapshot: "Recent customer",
        company_name_snapshot: "Recent customer",
        grand_total: 100,
        currency: "HKD",
        quote_status: "50%",
        updated_at: "2026-09-01T08:00:00Z",
      },
      ...[1, 2, 3].map((index) => ({
        id: `frequent-${index}`,
        order_number: `Q20${index}`,
        customer_name_snapshot: "Frequent customer",
        company_name_snapshot: "Frequent customer",
        grand_total: 100,
        currency: "HKD",
        quote_status: "Done Deal",
        updated_at: `2026-08-${20 + index}T08:00:00Z`,
      })),
    ]);

    expect(result.map((customer) => [customer.brandName, customer.quoteCount])).toEqual([
      ["Frequent customer", 3],
      ["Recent customer", 1],
    ]);
  });
});
