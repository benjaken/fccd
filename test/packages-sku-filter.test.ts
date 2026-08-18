import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: fromMock,
  },
}));

import { fetchPackages } from "@/lib/packages";

function createQuery(result: { data: unknown; count?: number; error: unknown }) {
  const query: Record<string, unknown> = {};
  const chain = [
    "select",
    "is",
    "not",
    "neq",
    "eq",
    "or",
    "in",
    "gte",
    "lt",
    "order",
    "range",
    "limit",
  ];
  for (const method of chain) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.then = (
    resolve: (value: { data: unknown; count?: number; error: unknown }) => unknown,
  ) => resolve(result);
  return query;
}

describe("package SKU list filter", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("excludes packages without a SKU from the package list", async () => {
    const query = createQuery({ data: [], count: 0, error: null });
    fromMock.mockReturnValue(query);

    await fetchPackages({
      page: 1,
      search: "",
      channelId: "",
      status: "",
      sortField: "sku",
      sortAscending: true,
    });

    expect(fromMock).toHaveBeenCalledWith("packages");
    expect(query.not).toHaveBeenCalledWith("sku", "is", null);
    expect(query.neq).toHaveBeenCalledWith("sku", "");
  });

  it("keeps the Active status filter when hiding no-SKU rows", async () => {
    const query = createQuery({ data: [], count: 0, error: null });
    fromMock.mockReturnValue(query);

    await fetchPackages({
      page: 1,
      search: "",
      channelId: "",
      status: "Active",
      sortField: "sku",
      sortAscending: true,
    });

    expect(query.eq).toHaveBeenCalledWith("is_active", true);
  });
});
