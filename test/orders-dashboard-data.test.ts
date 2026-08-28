import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: fromMock,
  },
}));

import { fetchOrdersDashboardData } from "@/lib/orders-dashboard";

type QueryResult = { data: unknown; count?: number; error: unknown };

function createCountQuery(result: QueryResult) {
  const query: Record<string, unknown> = {};
  const chain = [
    "select",
    "is",
    "not",
    "neq",
    "eq",
    "gt",
    "or",
    "in",
    "gte",
    "lt",
    "order",
    "limit",
  ];
  for (const method of chain) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.then = (resolve: (value: QueryResult) => unknown) => resolve(result);
  return query;
}

describe("orders dashboard data", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("counts the six queues and loads five top-five lists", async () => {
    const counts: Record<string, number> = {
      shopify: 4,
      unpaid: 12,
      factory: 7,
      pending: 3,
      upcoming: 5,
      todayFollowUp: 2,
    };
    let index = 0;
    const results = [
      { data: [], count: counts.shopify, error: null },
      { data: [], count: counts.unpaid, error: null },
      { data: [], count: counts.factory, error: null },
      { data: [], count: counts.pending, error: null },
      { data: [], count: counts.upcoming, error: null },
      { data: [], count: counts.todayFollowUp, error: null },
      { data: [], count: 0, error: null },
      { data: [], count: 0, error: null },
      { data: [], count: 0, error: null },
      { data: [], count: 0, error: null },
      { data: [], count: 0, error: null },
    ];
    fromMock.mockImplementation(() => createCountQuery(results[index++]));

    const data = await fetchOrdersDashboardData(
      new Date("2026-08-18T04:00:00+08:00"),
    );

    expect(data.shopifyPending).toBe(4);
    expect(data.unpaid).toBe(12);
    expect(data.notSentToFactory).toBe(7);
    expect(data.pendingQuotes).toBe(3);
    expect(data.upcomingQuotes).toBe(5);
    expect(data.todayFollowUpQuotes).toBe(2);
    expect(fromMock).toHaveBeenCalledTimes(11);
  });

  it("keeps Shopify review filters while only treating explicit false as not sent", async () => {
    const orFilters: string[] = [];
    const eqFilters: Array<[string, unknown]> = [];
    fromMock.mockImplementation((table: string) => {
      const query = createCountQuery({ data: [], count: 0, error: null });
      const originalOr = query.or as ReturnType<typeof vi.fn>;
      originalOr.mockImplementation((filter: string) => {
        orFilters.push(filter);
        return query;
      });
      const originalEq = query.eq as ReturnType<typeof vi.fn>;
      originalEq.mockImplementation((column: string, value: unknown) => {
        eqFilters.push([column, value]);
        return query;
      });
      return query;
    });

    await fetchOrdersDashboardData(new Date("2026-08-18T04:00:00+08:00"));

    expect(orFilters.some((filter) =>
      filter.includes("addon_shopify_pending.eq.true") &&
      filter.includes("is_sent_to_factory.is.null") &&
      filter.includes("is_sent_to_factory.eq.false"),
    )).toBe(true);
    expect(eqFilters).toContainEqual(["is_sent_to_factory", false]);
    expect(eqFilters).toContainEqual(["do_not_send_to_factory", false]);
    expect(
      orFilters.filter((filter) =>
        filter.includes('quote_status.not.in.("Done Deal","Case Closed")'),
      ),
    ).toHaveLength(6);
  });

  it("uses the next two weeks as the upcoming quote window", async () => {
    const captured: string[] = [];
    fromMock.mockImplementation((table: string) => {
      const query = createCountQuery({ data: [], count: 0, error: null });
      const originalGte = query.gte as ReturnType<typeof vi.fn>;
      const originalLt = query.lt as ReturnType<typeof vi.fn>;
      originalGte.mockImplementation((column: string, value: unknown) => {
        captured.push(`gte:${column}:${value}`);
        return query;
      });
      originalLt.mockImplementation((column: string, value: unknown) => {
        captured.push(`lt:${column}:${value}`);
        return query;
      });
      return query;
    });

    await fetchOrdersDashboardData(new Date("2026-08-18T04:00:00+08:00"));

    expect(captured).toContain("gte:delivery_at:2026-08-18T00:00:00+08:00");
    expect(captured).toContain("lt:delivery_at:2026-09-01T00:00:00+08:00");
  });

  it("loads only open quotes whose Hong Kong follow-up date is today", async () => {
    const captured: Array<[string, unknown]> = [];
    fromMock.mockImplementation(() => {
      const query = createCountQuery({ data: [], count: 0, error: null });
      const originalEq = query.eq as ReturnType<typeof vi.fn>;
      originalEq.mockImplementation((column: string, value: unknown) => {
        captured.push([column, value]);
        return query;
      });
      return query;
    });

    await fetchOrdersDashboardData(new Date("2026-08-18T23:30:00+08:00"));

    expect(
      captured.filter(([column, value]) =>
        column === "quote_follow_up_date" && value === "2026-08-18",
      ),
    ).toHaveLength(2);
  });
});
