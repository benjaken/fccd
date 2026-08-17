import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: fromMock,
  },
}));

import { fetchProducts, searchCatalogProducts } from "@/lib/products";

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

describe("product SKU list filter", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("excludes products without a SKU from the catalog list", async () => {
    const query = createQuery({ data: [], count: 0, error: null });
    fromMock.mockReturnValue(query);

    await fetchProducts({
      page: 1,
      search: "",
      channelId: "",
      productTypeName: "",
      status: "",
      priceRange: "",
      preset: "all",
    });

    expect(fromMock).toHaveBeenCalledWith("products");
    expect(query.not).toHaveBeenCalledWith("sku", "is", null);
    expect(query.neq).toHaveBeenCalledWith("sku", "");
    expect(query.order).toHaveBeenCalledWith("sku", {
      ascending: true,
      nullsFirst: false,
    });
  });

  it("orders the catalog by Chinese name then English name", async () => {
    const query = createQuery({ data: [], count: 0, error: null });
    fromMock.mockReturnValue(query);

    await fetchProducts({
      page: 1,
      search: "",
      channelId: "",
      productTypeName: "",
      status: "",
      priceRange: "",
      sortField: "name",
      sortAscending: false,
      preset: "all",
    });

    expect(query.order).toHaveBeenCalledWith("chinese_name", {
      ascending: false,
      nullsFirst: false,
    });
    expect(query.order).toHaveBeenCalledWith("name", {
      ascending: false,
      nullsFirst: false,
    });
  });

  it("excludes products without a SKU from catalog search", async () => {
    const query = createQuery({ data: [], error: null });
    fromMock.mockReturnValue(query);

    await searchCatalogProducts("燒雞");

    expect(query.not).toHaveBeenCalledWith("sku", "is", null);
    expect(query.neq).toHaveBeenCalledWith("sku", "");
  });

  it("filters the catalog by staple type", async () => {
    const query = createQuery({ data: [], count: 0, error: null });
    fromMock.mockReturnValue(query);

    await fetchProducts({
      page: 1,
      search: "",
      channelId: "",
      productTypeName: "",
      bentoMainTypeId: "staple-1",
      status: "",
      priceRange: "",
      preset: "all",
    });

    expect(query.eq).toHaveBeenCalledWith("bento_main_type_id", "staple-1");
  });
});
