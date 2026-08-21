import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: fromMock,
  },
}));

import {
  fetchQuoteBrands,
  fetchQuotes,
  QUOTE_STATUS_UNSET,
} from "@/lib/quotes";

type QueryResult = { data: unknown; count?: number; error: unknown };

function createQuery(result: QueryResult) {
  const query: Record<string, unknown> = {};
  const chain = [
    "select",
    "is",
    "not",
    "neq",
    "eq",
    "gt",
    "gte",
    "lt",
    "or",
    "in",
    "order",
    "range",
  ];
  for (const method of chain) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.then = (resolve: (value: QueryResult) => unknown) => resolve(result);
  return query;
}

describe("quote list presets", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("loads the complete channel master for the brand filter", async () => {
    const query = createQuery({
      data: [
        { id: "brand-2", name: "  HK Party Food  " },
        { id: "brand-1", name: "Catering" },
      ],
      error: null,
    });
    fromMock.mockReturnValue(query);

    await expect(fetchQuoteBrands()).resolves.toEqual([
      { id: "brand-2", name: "HK Party Food" },
      { id: "brand-1", name: "Catering" },
    ]);
    expect(fromMock).toHaveBeenCalledWith("channels");
    expect(query.select).toHaveBeenCalledWith("id,name");
    expect(query.order).toHaveBeenCalledWith("sort_order", {
      ascending: true,
      nullsFirst: false,
    });
    expect(query.order).toHaveBeenCalledWith("name", { ascending: true });
  });

  it("matches the legacy pending queue by excluding completed quote statuses", async () => {
    const query = createQuery({ data: [], count: 0, error: null });
    fromMock.mockReturnValue(query);

    await fetchQuotes({
      page: 1,
      search: "",
      status: "",
      preset: "pending",
      now: new Date("2026-08-18T04:00:00+08:00"),
    });

    expect(fromMock).toHaveBeenCalledWith("orders");
    expect(query.eq).toHaveBeenCalledWith("document_type", "quote");
    expect(query.or).toHaveBeenCalledWith(
      'quote_status.is.null,quote_status.not.in.("Done Deal","Case Closed")',
    );
  });

  it("orders upcoming quotes by delivery date first", async () => {
    const query = createQuery({ data: [], count: 0, error: null });
    fromMock.mockReturnValue(query);

    await fetchQuotes({
      page: 1,
      search: "",
      status: "",
      preset: "upcoming",
      now: new Date("2026-08-18T04:00:00+08:00"),
    });

    expect(query.gte).toHaveBeenCalledWith(
      "delivery_at",
      "2026-08-18T00:00:00+08:00",
    );
    expect(query.lt).toHaveBeenCalledWith(
      "delivery_at",
      "2026-09-01T00:00:00+08:00",
    );
    expect(query.order).toHaveBeenCalledWith("delivery_at", {
      ascending: true,
      nullsFirst: false,
    });
    expect(query.range).toHaveBeenCalledWith(0, 14);
  });

  it("orders quotes by creation date in the requested direction", async () => {
    const query = createQuery({ data: [], count: 0, error: null });
    fromMock.mockReturnValue(query);

    await fetchQuotes({
      page: 1,
      search: "",
      status: "",
      createdSort: "ascending",
    });

    expect(query.order).toHaveBeenCalledWith("bubble_created_at", {
      ascending: true,
      nullsFirst: false,
    });
    expect(query.order).toHaveBeenCalledWith("created_at", {
      ascending: true,
    });
  });

  it("filters by brand and sorts by quote number", async () => {
    const query = createQuery({ data: [], count: 0, error: null });
    fromMock.mockReturnValue(query);

    await fetchQuotes({
      page: 1,
      search: "",
      status: "",
      brandId: "brand-1",
      orderNumberSort: "descending",
    });

    expect(query.eq).toHaveBeenCalledWith("channel_id", "brand-1");
    expect(query.order).toHaveBeenCalledWith("order_number", {
      ascending: false,
      nullsFirst: false,
    });
  });

  it("filters quotes whose status was never set", async () => {
    const query = createQuery({ data: [], count: 0, error: null });
    fromMock.mockReturnValue(query);

    await fetchQuotes({
      page: 1,
      search: "",
      status: QUOTE_STATUS_UNSET,
    });

    expect(query.is).toHaveBeenCalledWith("quote_status", null);
    expect(query.eq).not.toHaveBeenCalledWith("quote_status", QUOTE_STATUS_UNSET);
  });
});
