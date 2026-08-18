import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: fromMock,
  },
}));

import { fetchQuotes } from "@/lib/quotes";

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

  it("filters pending quotes to EmailMeForm inquiries still open", async () => {
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
    expect(query.eq).toHaveBeenCalledWith("source_system", "emailmeform");
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
});
