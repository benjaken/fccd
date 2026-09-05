import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.hoisted(() => vi.fn());
const rpcMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  supabase: { from: fromMock, rpc: rpcMock },
}));

import {
  fetchFollowUpCounts,
  followUpCountForKey,
} from "@/lib/follow-up-counts";

type QueryResult = {
  count: number | null;
  error: { message: string } | null;
};

function createCountQuery(result: QueryResult) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "or", "gt", "gte"]) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.then = (resolve: (value: QueryResult) => unknown) => resolve(result);
  return query;
}

describe("follow-up menu counts", () => {
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: 5, error: null });
  });

  it("loads the actionable queue totals", async () => {
    const totals = [4, 3, 12, 7, 2];
    let index = 0;
    fromMock.mockImplementation(() =>
      createCountQuery({ count: totals[index++], error: null }),
    );

    await expect(
      fetchFollowUpCounts(new Date("2026-09-02T09:00:00+08:00")),
    ).resolves.toEqual({
      pendingEntry: 4,
      pendingQuote: 3,
      pendingPayment: 12,
      pendingFactory: 7,
      pendingDriver: 2,
      customerOrderInquiries: 5,
    });
    expect(fromMock).toHaveBeenCalledTimes(5);
    expect(rpcMock).toHaveBeenCalledWith(
      "customer_service_order_inquiries_pending_count",
    );
  });

  it("does not add a total to products awaiting review yet", () => {
    expect(
      followUpCountForKey(
        {
          pendingEntry: 4,
          pendingQuote: 3,
          pendingPayment: 12,
          pendingFactory: 7,
          pendingDriver: 2,
          customerOrderInquiries: 5,
        },
        "pendingProductReview",
      ),
    ).toBeUndefined();
  });

  it("matches the list filters and uses the Hong Kong day for factory jobs", async () => {
    const filters: Array<[string, string, unknown]> = [];
    fromMock.mockImplementation(() => {
      const query = createCountQuery({ count: 0, error: null });
      for (const method of ["eq", "or", "gt", "gte"] as const) {
        (query[method] as ReturnType<typeof vi.fn>).mockImplementation(
          (column: string, value?: unknown) => {
            filters.push([method, column, value]);
            return query;
          },
        );
      }
      return query;
    });

    await fetchFollowUpCounts(new Date("2026-09-01T18:30:00Z"));

    expect(filters).toContainEqual(["eq", "delivery_status", "待接單"]);
    expect(filters).toContainEqual(["eq", "is_sent_to_factory", false]);
    expect(filters).toContainEqual(["gt", "outstanding", 0]);
    expect(filters).toContainEqual([
      "gte",
      "delivery_at",
      "2026-09-02T00:00:00+08:00",
    ]);
    expect(
      filters.some(
        ([method, filter]) =>
          method === "or" &&
          filter.includes("addon_shopify_pending.eq.true"),
      ),
    ).toBe(true);
  });

  it("shows the unresolved WhatsApp total beside its navigation key", () => {
    expect(
      followUpCountForKey(
        {
          pendingEntry: 0,
          pendingQuote: 0,
          pendingPayment: 0,
          pendingFactory: 0,
          pendingDriver: 0,
          customerOrderInquiries: 8,
        },
        "customerOrderInquiries",
      ),
    ).toBe(8);
  });
});
