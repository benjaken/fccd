import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: fromMock,
  },
}));

import { fetchBentoColumnTypes, fetchCatalogCookTypes, fetchProducts, searchCatalogProducts, sortBentoColumnTypes, sortCookTypes } from "@/lib/products";

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

  it("filters the catalog by compartment type", async () => {
    const query = createQuery({ data: [], count: 0, error: null });
    fromMock.mockReturnValue(query);

    await fetchProducts({
      page: 1,
      search: "",
      channelId: "",
      productTypeName: "",
      bentoColumnTypeId: "column-2",
      status: "",
      priceRange: "",
      preset: "all",
    });

    expect(query.eq).toHaveBeenCalledWith("bento_column_type_id", "column-2");
  });

  it("orders compartment options as 單格, 雙格, 五格, 六格", async () => {
    const query = createQuery({
      data: [
        { id: "5", name: "五格" },
        { id: "6", name: "六格" },
        { id: "1", name: "單格" },
        { id: "2", name: "雙格" },
      ],
      error: null,
    });
    fromMock.mockReturnValue(query);

    await expect(fetchBentoColumnTypes()).resolves.toEqual([
      { id: "1", name: "單格" },
      { id: "2", name: "雙格" },
      { id: "5", name: "五格" },
      { id: "6", name: "六格" },
    ]);
    expect(sortBentoColumnTypes([{ id: "x", name: "其他" }, { id: "1", name: "單格" }]).map((row) => row.name)).toEqual(
      ["單格", "其他"],
    );
  });

  it("filters the catalog by cook type", async () => {
    const query = createQuery({ data: [], count: 0, error: null });
    fromMock.mockReturnValue(query);

    await fetchProducts({
      page: 1,
      search: "",
      channelId: "",
      productTypeName: "",
      cookTypeId: "cook-steam",
      status: "",
      priceRange: "",
      preset: "all",
    });

    expect(query.eq).toHaveBeenCalledWith("cook_type_id", "cook-steam");
  });

  it("orders cook type options as 炒爐, 蒸爐, 炸爐, 焗爐, 雪櫃, 直出", async () => {
    const query = createQuery({
      data: [
        { id: "6", name: "直出" },
        { id: "3", name: "炸爐" },
        { id: "1", name: "炒爐" },
        { id: "4", name: "焗爐" },
        { id: "5", name: "雪櫃" },
        { id: "2", name: "蒸爐" },
      ],
      error: null,
    });
    fromMock.mockReturnValue(query);

    await expect(fetchCatalogCookTypes()).resolves.toEqual([
      { id: "1", name: "炒爐" },
      { id: "2", name: "蒸爐" },
      { id: "3", name: "炸爐" },
      { id: "4", name: "焗爐" },
      { id: "5", name: "雪櫃" },
      { id: "6", name: "直出" },
    ]);
    expect(
      sortCookTypes([{ id: "x", name: "其他" }, { id: "1", name: "炒爐" }]).map(
        (row) => row.name,
      ),
    ).toEqual(["炒爐", "其他"]);
  });

  it("resolves cook type names from the lookup when the embed is empty", async () => {
    const productsQuery = createQuery({
      data: [
        {
          id: "product-1",
          sku: "CDEC22-12",
          name: "花開富貴玫瑰糕 (12件)",
          chinese_name: null,
          price: 88,
          price_min: null,
          price_max: null,
          status: "Active",
          is_active: true,
          is_bento_recommended: false,
          bubble_created_at: null,
          created_at: "2026-08-12T01:00:00.000Z",
          channels: { id: "channel-1", name: "Catering" },
          product_types: null,
          cook_type_id: "cook-steam",
          cook_types: null,
          bento_main_type_id: null,
          bento_column_type_id: null,
        },
      ],
      count: 1,
      error: null,
    });
    const cookQuery = createQuery({
      data: [{ id: "cook-steam", name: "蒸爐" }],
      error: null,
    });
    const emptyQuery = createQuery({ data: [], error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === "products") return productsQuery;
      if (table === "cook_types") return cookQuery;
      return emptyQuery;
    });

    const result = await fetchProducts({
      page: 1,
      search: "",
      channelId: "",
      productTypeName: "",
      status: "",
      priceRange: "",
      preset: "all",
    });

    expect(result.items[0]?.cookTypeName).toBe("蒸爐");
  });
});
