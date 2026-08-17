import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PackagesListPage } from "@/components/PackagesListPage";
import { PackageDetailPage } from "@/components/PackageDetailPage";
import { ProductDetailPage } from "@/components/ProductDetailPage";
import { ProductsListPage } from "@/components/ProductsListPage";
import i18n from "@/i18n";
import type { PackageDetail, PackageListResult } from "@/lib/packages";
import { hasProductSku, normalizeProductSku, type ProductDetail, type ProductListResult } from "@/lib/products";

const productResult: ProductListResult = {
  total: 1,
  items: [
    {
      id: "product-1",
      sku: "CC-001",
      name: "Roast Chicken",
      chineseName: "燒雞",
      price: 188,
      priceMin: 168,
      priceMax: 208,
      status: "Active",
      isActive: true,
      isBentoRecommended: true,
      channelId: "channel-1",
      channelName: "Catering",
      productTypeId: "type-1",
      productTypeName: "西式熱盤",
      cookTypeId: "cook-1",
      cookTypeName: "焗爐",
      bentoMainTypeId: "staple-1",
      bentoMainTypeName: "飯",
      bentoColumnTypeId: "column-1",
      bentoColumnTypeName: "雙格",
      mainIngredients: ["雞"],
      specialRequests: ["不辣", "適合小朋友"],
      createdAt: "2026-08-12T01:00:00.000Z",
    },
  ],
};

const productDetail: ProductDetail = {
  id: "product-1",
  legacyId: "legacy-product-1",
  sku: "CC-001",
  name: "Roast Chicken",
  chineseName: "燒雞",
  description: "經典到會燒雞",
  imageUrl: null,
  price: 188,
  priceMin: 168,
  priceMax: 208,
  status: "Active",
  isActive: true,
  isBentoRecommended: true,
  channelId: "channel-1",
  channelName: "Catering",
  productTypeId: "type-1",
  productTypeName: "西式熱盤",
  cookTypeId: "cook-1",
  cookTypeName: "焗爐",
  bentoMainTypeId: "staple-1",
  bentoMainTypeName: "飯",
  bentoColumnTypeId: "column-1",
  bentoColumnTypeName: "雙格",
  collections: [{ id: "col-1", name: "西式熱盤", legacyId: "legacy-col-1" }],
  premiumIngredients: [
    {
      id: "prem-1",
      ingredientId: "ing-x",
      name: "松露",
      quantity: 1,
      unitCost: 12,
    },
  ],
  labels: [
    {
      id: "label-1",
      displayA: "(雙格) 拿破崙",
      displayB: "雞扒意粉",
      packingMaterialId: null,
      packingName: null,
    },
  ],
  packages: [
    {
      id: "package-1",
      sku: "CCFA0406",
      name: "Family Feast",
      chineseName: "精緻家庭美宴 (4-6人)",
    },
  ],
  updatedAt: "2026-08-12T01:00:00.000Z",
};

const productEditOptions = {
  channels: [{ id: "channel-1", name: "Catering" }],
  productTypes: [{ id: "type-1", name: "西式熱盤" }],
  cookTypes: [{ id: "cook-1", name: "焗爐" }],
  collections: [
    { id: "col-1", name: "西式熱盤", legacyId: "legacy-col-1" },
    { id: "col-2", name: "飲品", legacyId: "legacy-col-2" },
  ],
  packingMaterials: [{ id: "pack-1", name: "紙盒" }],
  catalogIngredients: [{ id: "ing-x", name: "松露", legacyId: "legacy-ing-x" }],
};

const packageResult: PackageListResult = {
  total: 1,
  items: [
    {
      id: "package-1",
      sku: "CCFA0406",
      name: "Family Feast",
      chineseName: "精緻家庭美宴 (4-6人)",
      price: 1280,
      status: "Active",
      isActive: true,
      channelId: "channel-1",
      channelName: "Catering",
      choiceSetCount: 1,
      createdAt: "2024-03-21T00:00:00.000Z",
    },
  ],
};

const packageDetail: PackageDetail = {
  id: "package-1",
  legacyId: "legacy-package-1",
  sku: "CCFA0406",
  name: "Family Feast",
  chineseName: "精緻家庭美宴 (4-6人)",
  description: "適合家庭聚會",
  price: 1280,
  status: "Active",
  isActive: true,
  channelId: "channel-1",
  channelName: "Catering",
  createdAt: "2024-03-21T00:00:00.000Z",
  updatedAt: "2026-08-12T01:00:00.000Z",
  choiceSets: [
    {
      id: "choice-1",
      legacyId: "legacy-choice-1",
      name: "中式小菜",
      maximumChoices: 2,
      products: [
        {
          id: "member-1",
          productId: "product-1",
          quantity: 1,
          addonPrice: 0,
          isSelected: true,
          productSku: "CC-001",
          productName: "Roast Chicken",
          productChineseName: "燒雞",
          productPrice: 188,
          choiceSetLegacyId: "legacy-choice-1",
        },
      ],
    },
  ],
  ungroupedProducts: [],
};

describe("hasProductSku", () => {
  it("treats blank values as missing so incomplete Bubble rows can be hidden", () => {
    expect(hasProductSku(null)).toBe(false);
    expect(hasProductSku("")).toBe(false);
    expect(hasProductSku("   ")).toBe(false);
    expect(hasProductSku("CC-001")).toBe(true);
  });
});

describe("normalizeProductSku", () => {
  it("trims leftover Bubble spaces so SKU sort is A-Z", () => {
    expect(normalizeProductSku(" KRIC04-3")).toBe("KRIC04-3");
    expect(normalizeProductSku("CAC001")).toBe("CAC001");
    expect(normalizeProductSku("  ")).toBeNull();
  });
});

describe("Products catalog pages", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("renders product fields and links to the product record", async () => {
    const loadProducts = vi.fn().mockResolvedValue(productResult);
    const loadChannels = vi.fn().mockResolvedValue([
      { id: "channel-1", name: "Catering" },
    ]);

    render(
      <MemoryRouter>
        <ProductsListPage
          loadProducts={loadProducts}
          loadChannels={loadChannels}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "全部商品" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "燒雞" }),
    ).toHaveAttribute("href", "/products/product-1");
    expect(screen.getByText("CC-001")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("Catering")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("西式熱盤")).toBeInTheDocument();
    expect(screen.getByText("HK$188")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "品牌" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "SKU" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "產品名稱" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "類別" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "主食" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "價錢" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Range" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "格數" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "主要食材" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "特別要求" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "烹煮方式" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "推介" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "啟用" })).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "建立日期" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("已推薦")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "編輯" })).not.toBeInTheDocument();
  });

  it("shows table skeleton rows while products are loading", async () => {
    let resolveProducts!: (value: ProductListResult) => void;
    const loadProducts = vi.fn(
      () =>
        new Promise<ProductListResult>((resolve) => {
          resolveProducts = resolve;
        }),
    );
    const loadChannels = vi.fn().mockResolvedValue([]);

    render(
      <MemoryRouter>
        <ProductsListPage
          loadProducts={loadProducts}
          loadChannels={loadChannels}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "正在載入商品",
    );
    expect(screen.getByRole("columnheader", { name: "SKU" })).toBeInTheDocument();
    expect(document.querySelectorAll(".table-skeleton-row")).toHaveLength(15);

    resolveProducts(productResult);
    expect(await screen.findByText("CC-001")).toBeInTheDocument();
    expect(document.querySelectorAll(".table-skeleton-row")).toHaveLength(0);
  });

  it("keeps table skeleton bones light and order links on primary", () => {
    const stylesheet = readFileSync(
      path.resolve(process.cwd(), "src/index.css"),
      "utf8",
    );
    const skeletonRules = [
      ...stylesheet.matchAll(/\.table-skeleton-bone\s*\{([^}]+)\}/g),
    ]
      .map((match) => match[1])
      .join("\n");
    const linkRules = [
      ...stylesheet.matchAll(/\.order-link\s*\{([^}]+)\}/g),
    ]
      .map((match) => match[1])
      .join("\n");

    expect(skeletonRules).toContain("var(--card)");
    expect(skeletonRules).not.toContain("var(--foreground)");
    expect(linkRules).toContain("color: var(--primary)");
  });

  it("submits a server-side product search and resets to the first page", async () => {
    const user = userEvent.setup();
    const loadProducts = vi.fn().mockResolvedValue(productResult);
    const loadChannels = vi.fn().mockResolvedValue([]);

    render(
      <MemoryRouter>
        <ProductsListPage
          loadProducts={loadProducts}
          loadChannels={loadChannels}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(loadProducts).toHaveBeenCalledTimes(1));
    await user.type(
      screen.getByPlaceholderText("搜尋 SKU、名稱或中文名"),
      "燒雞",
    );
    await user.click(screen.getByRole("button", { name: "搜尋" }));

    await waitFor(() =>
      expect(loadProducts).toHaveBeenLastCalledWith({
        page: 1,
        search: "燒雞",
        channelId: "",
        productTypeName: "",
        bentoMainTypeId: "",
        bentoColumnTypeId: "",
        cookTypeId: "",
        status: "",
        priceRange: "",
        sortField: "sku",
        sortAscending: true,
        preset: "all",
      }),
    );
  });

  it("sorts the product list by SKU, name, and price", async () => {
    const user = userEvent.setup();
    const loadProducts = vi.fn().mockResolvedValue(productResult);
    const loadChannels = vi.fn().mockResolvedValue([]);

    render(
      <MemoryRouter>
        <ProductsListPage
          loadProducts={loadProducts}
          loadChannels={loadChannels}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(loadProducts).toHaveBeenCalledTimes(1));
    expect(loadProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({ sortField: "sku", sortAscending: true }),
    );

    await user.click(screen.getByRole("button", { name: "產品名稱" }));
    await waitFor(() =>
      expect(loadProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortField: "name", sortAscending: true }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "產品名稱" }));
    await waitFor(() =>
      expect(loadProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortField: "name", sortAscending: false }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "價錢" }));
    await waitFor(() =>
      expect(loadProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortField: "price", sortAscending: true }),
      ),
    );
  });

  it("filters by price range, channel, type, staple, compartments, cook method, and status dropdowns", async () => {
    const user = userEvent.setup();
    const loadProducts = vi.fn().mockResolvedValue(productResult);
    const loadChannels = vi.fn().mockResolvedValue([
      { id: "channel-1", name: "Catering" },
    ]);
    const loadProductTypes = vi.fn().mockResolvedValue([
      { id: "西式熱盤", name: "西式熱盤" },
    ]);
    const loadBentoMainTypes = vi.fn().mockResolvedValue([
      { id: "staple-1", name: "飯" },
      { id: "staple-2", name: "扁意粉" },
    ]);
    const loadBentoColumnTypes = vi.fn().mockResolvedValue([
      { id: "column-1", name: "單格" },
      { id: "column-2", name: "雙格" },
      { id: "column-5", name: "五格" },
      { id: "column-6", name: "六格" },
    ]);
    const loadCookTypes = vi.fn().mockResolvedValue([
      { id: "cook-stir", name: "炒爐" },
      { id: "cook-steam", name: "蒸爐" },
      { id: "cook-fry", name: "炸爐" },
      { id: "cook-oven", name: "焗爐" },
      { id: "cook-fridge", name: "雪櫃" },
      { id: "cook-direct", name: "直出" },
    ]);

    render(
      <MemoryRouter>
        <ProductsListPage
          loadProducts={loadProducts}
          loadChannels={loadChannels}
          loadProductTypes={loadProductTypes}
          loadBentoMainTypes={loadBentoMainTypes}
          loadBentoColumnTypes={loadBentoColumnTypes}
          loadCookTypes={loadCookTypes}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(loadProducts).toHaveBeenCalledTimes(1));

    await user.selectOptions(
      screen.getByLabelText("售價範圍"),
      "100-299",
    );
    await waitFor(() =>
      expect(loadProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ priceRange: "100-299", page: 1 }),
      ),
    );

    await user.selectOptions(screen.getByLabelText("渠道"), "channel-1");
    await waitFor(() =>
      expect(loadProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ channelId: "channel-1", page: 1 }),
      ),
    );

    await user.selectOptions(screen.getByLabelText("類別"), "西式熱盤");
    await waitFor(() =>
      expect(loadProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ productTypeName: "西式熱盤", page: 1 }),
      ),
    );

    await user.selectOptions(screen.getByLabelText("狀態"), "Active");
    await waitFor(() =>
      expect(loadProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: "Active",
          channelId: "channel-1",
          productTypeName: "西式熱盤",
          priceRange: "100-299",
          page: 1,
        }),
      ),
    );

    await user.selectOptions(screen.getByLabelText("主食"), "staple-1");
    await waitFor(() =>
      expect(loadProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          bentoMainTypeId: "staple-1",
          page: 1,
        }),
      ),
    );

    await user.selectOptions(screen.getByLabelText("格數"), "column-2");
    await waitFor(() =>
      expect(loadProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          bentoColumnTypeId: "column-2",
          page: 1,
        }),
      ),
    );

    await user.selectOptions(screen.getByLabelText("烹煮方式"), "cook-steam");
    await waitFor(() =>
      expect(loadProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          cookTypeId: "cook-steam",
          page: 1,
        }),
      ),
    );

    expect(screen.getByLabelText("格數")).toHaveTextContent("單格");
    expect(screen.getByLabelText("格數")).toHaveTextContent("雙格");
    expect(screen.getByLabelText("格數")).toHaveTextContent("五格");
    expect(screen.getByLabelText("格數")).toHaveTextContent("六格");
    expect(screen.getByLabelText("烹煮方式")).toHaveTextContent("炒爐");
    expect(screen.getByLabelText("烹煮方式")).toHaveTextContent("蒸爐");
    expect(screen.getByLabelText("烹煮方式")).toHaveTextContent("炸爐");
    expect(screen.getByLabelText("烹煮方式")).toHaveTextContent("焗爐");
    expect(screen.getByLabelText("烹煮方式")).toHaveTextContent("雪櫃");
    expect(screen.getByLabelText("烹煮方式")).toHaveTextContent("直出");

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("lets an editor toggle recommendation and shows the edit action", async () => {
    const user = userEvent.setup();
    const loadProducts = vi.fn().mockResolvedValue(productResult);
    const loadChannels = vi.fn().mockResolvedValue([
      { id: "channel-1", name: "Catering" },
    ]);
    const updateRecommendation = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <ProductsListPage
          canEdit
          loadProducts={loadProducts}
          loadChannels={loadChannels}
          updateRecommendation={updateRecommendation}
        />
      </MemoryRouter>,
    );

    const star = await screen.findByRole("button", { name: "已推薦" });
    await user.click(star);
    await waitFor(() =>
      expect(updateRecommendation).toHaveBeenCalledWith("product-1", false),
    );
    expect(screen.getByRole("button", { name: "未推薦" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "編輯" })).toBeInTheDocument();
  });

  it("opens product details when a list row is clicked", async () => {
    const user = userEvent.setup();
    const loadProducts = vi.fn().mockResolvedValue(productResult);
    const loadChannels = vi.fn().mockResolvedValue([]);

    render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              <ProductsListPage
                loadProducts={loadProducts}
                loadChannels={loadChannels}
              />
            }
          />
          <Route path="/products/:id" element={<div>商品詳情頁</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const row = (await screen.findByText("CC-001")).closest("tr");
    expect(row).not.toBeNull();
    await user.click(row!);
    expect(await screen.findByText("商品詳情頁")).toBeInTheDocument();
  });

  it("shows bento columns on every product list", async () => {
    const loadProducts = vi.fn().mockResolvedValue(productResult);
    const loadChannels = vi.fn().mockResolvedValue([]);

    render(
      <MemoryRouter>
        <ProductsListPage
          preset="ala-carte"
          loadProducts={loadProducts}
          loadChannels={loadChannels}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "單點食物" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "主食" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "格數" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "主要食材" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "特別要求" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "烹煮方式" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "推介" })).toBeInTheDocument();
    expect(screen.getByText("飯")).toBeInTheDocument();
    expect(screen.getByText("雙格")).toBeInTheDocument();
    expect(screen.getByText("雞")).toBeInTheDocument();
    expect(screen.getByText("不辣")).toBeInTheDocument();
  });

  it("renders product detail fields", async () => {
    render(
      <MemoryRouter initialEntries={["/products/product-1"]}>
        <Routes>
          <Route
            path="/products/:id"
            element={
              <ProductDetailPage loadDetail={async () => productDetail} />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "燒雞" })).toBeInTheDocument();
    expect(screen.getByText("經典到會燒雞")).toBeInTheDocument();
    expect(screen.getAllByText("西式熱盤").length).toBeGreaterThan(0);
    expect(screen.getByText("焗爐")).toBeInTheDocument();
    expect(screen.getByText("Catering")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "精緻家庭美宴 (4-6人)" }),
    ).toHaveAttribute("href", "/products/packages/package-1");
    expect(screen.getByLabelText("已推薦")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "產品列表" }),
    ).toHaveAttribute("href", "/products");
    expect(screen.getByText("名貴食材", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("松露")).toBeInTheDocument();
    expect(screen.getByText("(雙格) 拿破崙")).toBeInTheDocument();
    expect(screen.getAllByText("爐位類別").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "編輯" })).not.toBeInTheDocument();
  });

  it("returns product detail to the page that opened it", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/products/product-1",
            state: { from: "/products/packages/package-1" },
          },
        ]}
      >
        <Routes>
          <Route
            path="/products/:id"
            element={
              <ProductDetailPage loadDetail={async () => productDetail} />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "產品列表" })).toHaveAttribute(
      "href",
      "/products/packages/package-1",
    );
  });

  it("saves product edits from the detail form", async () => {
    const user = userEvent.setup();
    const saveProduct = vi.fn().mockResolvedValue(undefined);
    const loadEditOptions = vi.fn().mockResolvedValue(productEditOptions);

    render(
      <MemoryRouter initialEntries={["/products/product-1/edit"]}>
        <Routes>
          <Route
            path="/products/:id/edit"
            element={
              <ProductDetailPage
                canEdit
                loadDetail={async () => productDetail}
                loadEditOptions={loadEditOptions}
                saveProduct={saveProduct}
              />
            }
          />
          <Route path="/products/:id" element={<div>已返回詳情</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "確認更改" })).toBeInTheDocument();
    const chineseName = await screen.findByLabelText("中文名稱");
    await user.clear(chineseName);
    await user.type(chineseName, "香草燒雞");
    await user.click(screen.getByRole("button", { name: "確認更改" }));

    await waitFor(() =>
      expect(saveProduct).toHaveBeenCalledWith(
        "product-1",
        expect.objectContaining({
          chineseName: "香草燒雞",
          isBentoRecommended: true,
          collectionIds: ["col-1"],
        }),
      ),
    );
    expect(await screen.findByText("已返回詳情")).toBeInTheDocument();
  });

  it("lets editors pick multiple product collections from a dropdown", async () => {
    const user = userEvent.setup();
    const saveProduct = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={["/products/product-1/edit"]}>
        <Routes>
          <Route
            path="/products/:id/edit"
            element={
              <ProductDetailPage
                canEdit
                loadDetail={async () => productDetail}
                loadEditOptions={async () => productEditOptions}
                saveProduct={saveProduct}
              />
            }
          />
          <Route path="/products/:id" element={<div>已返回詳情</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const picker = await screen.findByRole("combobox", { name: "產品集" });
    expect(picker).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "飲品", pressed: false })).not.toBeInTheDocument();
    await user.click(picker);
    await user.click(await screen.findByRole("option", { name: "飲品" }));
    await user.click(screen.getByRole("button", { name: "確認更改" }));

    await waitFor(() =>
      expect(saveProduct).toHaveBeenCalledWith(
        "product-1",
        expect.objectContaining({
          collectionIds: ["col-1", "col-2"],
        }),
      ),
    );
  });

  it("searches and adds a premium ingredient", async () => {
    const user = userEvent.setup();
    const addIngredient = vi.fn().mockResolvedValue(undefined);
    const searchIngredients = vi.fn().mockResolvedValue([
      { id: "ing-coke", name: "可口可樂", sku: "COKE", legacyId: "legacy-coke" },
    ]);
    const loadDetail = vi
      .fn()
      .mockResolvedValueOnce(productDetail)
      .mockResolvedValueOnce({
        ...productDetail,
        premiumIngredients: [
          ...productDetail.premiumIngredients,
          {
            id: "prem-2",
            ingredientId: "ing-coke",
            name: "可口可樂",
            quantity: 1,
            unitCost: 3.25,
          },
        ],
      });

    render(
      <MemoryRouter initialEntries={["/products/product-1/edit"]}>
        <Routes>
          <Route
            path="/products/:id/edit"
            element={
              <ProductDetailPage
                canEdit
                loadDetail={loadDetail}
                loadEditOptions={async () => productEditOptions}
                searchIngredients={searchIngredients}
                addIngredient={addIngredient}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    const search = await screen.findByRole("combobox", {
      name: "名貴食材",
    });
    await user.type(search, "可樂");

    await waitFor(() =>
      expect(searchIngredients).toHaveBeenCalledWith("可樂"),
    );
    await user.click(await screen.findByRole("option", { name: /可口可樂/ }));
    await user.click(screen.getByRole("button", { name: "添加食材" }));

    await waitFor(() =>
      expect(addIngredient).toHaveBeenCalledWith("product-1", "ing-coke", 1),
    );
    expect(await screen.findByText("可口可樂")).toBeInTheDocument();
  });
});

describe("Packages catalog pages", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("renders package fields and links to the package record", async () => {
    const loadPackages = vi.fn().mockResolvedValue(packageResult);
    const loadChannels = vi.fn().mockResolvedValue([
      { id: "channel-1", name: "Catering" },
    ]);

    render(
      <MemoryRouter>
        <PackagesListPage
          loadPackages={loadPackages}
          loadChannels={loadChannels}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "套餐列表" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "精緻家庭美宴 (4-6人)" }),
    ).toHaveAttribute("href", "/products/packages/package-1");
    expect(screen.getByText("CCFA0406")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("Catering")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "品牌" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "套餐名稱" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "創建日期" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "類別數量" })).toBeInTheDocument();
    expect(screen.getByText("3/21/2024")).toBeInTheDocument();
    expect(screen.getByText("共 1 個結果")).toBeInTheDocument();
    expect(screen.getByText("HK$1,280.00")).toBeInTheDocument();
  });

  it("opens package details when a list row is clicked", async () => {
    const user = userEvent.setup();
    const loadPackages = vi.fn().mockResolvedValue(packageResult);

    render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              <PackagesListPage
                loadPackages={loadPackages}
                loadChannels={async () => []}
              />
            }
          />
          <Route path="/products/packages/:id" element={<div>套餐詳情頁</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const row = (await screen.findByText("CCFA0406")).closest("tr");
    expect(row).not.toBeNull();
    await user.click(row!);
    expect(await screen.findByText("套餐詳情頁")).toBeInTheDocument();
  });

  it("shows edit and delete actions for editors", async () => {
    const user = userEvent.setup();
    const loadPackages = vi.fn().mockResolvedValue(packageResult);

    render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              <PackagesListPage
                canEdit
                loadPackages={loadPackages}
                loadChannels={async () => [{ id: "channel-1", name: "Catering" }]}
              />
            }
          />
          <Route path="/products/packages/:id/edit" element={<div>套餐編輯頁</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "編輯" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刪除套餐" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "編輯" }));
    expect(await screen.findByText("套餐編輯頁")).toBeInTheDocument();
  });

  it("renders nested package options on the detail page", async () => {
    render(
      <MemoryRouter initialEntries={["/products/packages/package-1"]}>
        <Routes>
          <Route
            path="/products/packages/:id"
            element={
              <PackageDetailPage loadDetail={async () => packageDetail} />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "精緻家庭美宴 (4-6人)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("中式小菜")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "燒雞" })).toHaveAttribute(
      "href",
      "/products/product-1",
    );
    expect(screen.getByRole("link", { name: "套餐列表" })).toHaveAttribute(
      "href",
      "/products/packages",
    );
    expect(screen.getByRole("columnheader", { name: "類別名稱" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "附加價格" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "可選數量" })).toBeInTheDocument();
    expect(screen.getByText("CCFA0406")).toBeInTheDocument();
  });

  it("returns package detail to the page that opened it", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/products/packages/package-1",
            state: { from: "/products/product-1" },
          },
        ]}
      >
        <Routes>
          <Route
            path="/products/packages/:id"
            element={
              <PackageDetailPage loadDetail={async () => packageDetail} />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "套餐列表" })).toHaveAttribute(
      "href",
      "/products/product-1",
    );
  });

  it("searches and adds a product to a package option set", async () => {
    const user = userEvent.setup();
    const addChoiceSet = vi.fn().mockResolvedValue(undefined);
    const addProduct = vi.fn().mockResolvedValue(undefined);
    const searchProducts = vi.fn().mockResolvedValue([
      { id: "product-2", name: "黑白胡椒蝦", sku: "SHRIMP", legacyId: "legacy-shrimp" },
    ]);
    const updatedDetail = {
      ...packageDetail,
      choiceSets: [
        {
          ...packageDetail.choiceSets[0],
          products: [
            ...packageDetail.choiceSets[0].products,
            {
              id: "member-2",
              productId: "product-2",
              quantity: 1,
              addonPrice: 0,
              isSelected: false,
              productSku: "SHRIMP",
              productName: "Pepper Shrimp",
              productChineseName: "黑白胡椒蝦",
              productPrice: 0,
              choiceSetLegacyId: "legacy-choice-1",
            },
          ],
        },
      ],
    };
    const loadDetail = vi
      .fn()
      .mockResolvedValueOnce(packageDetail)
      .mockResolvedValueOnce(packageDetail)
      .mockResolvedValueOnce(updatedDetail);

    render(
      <MemoryRouter initialEntries={["/products/packages/package-1/edit"]}>
        <Routes>
          <Route
            path="/products/packages/:id/edit"
            element={
              <PackageDetailPage
                canEdit
                loadDetail={loadDetail}
                searchProducts={searchProducts}
                addChoiceSet={addChoiceSet}
                addProduct={addProduct}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "添加選項集" })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("填寫類別名稱"), "套餐必選12道菜");
    const selectable = screen.getByPlaceholderText("填寫可選數目");
    await user.clear(selectable);
    await user.type(selectable, "12");
    await user.click(screen.getByRole("button", { name: "添加選項集" }));
    await waitFor(() =>
      expect(addChoiceSet).toHaveBeenCalledWith("package-1", "套餐必選12道菜", 12),
    );

    await user.click(screen.getByRole("button", { name: "添加產品" }));
    await user.type(
      screen.getByRole("combobox", { name: "搜尋產品名稱或 SKU" }),
      "胡椒",
    );
    await waitFor(() => expect(searchProducts).toHaveBeenCalledWith("胡椒"));
    await user.click(await screen.findByRole("option", { name: /黑白胡椒蝦/ }));
    await waitFor(() =>
      expect(addProduct).toHaveBeenCalledWith(
        "package-1",
        "legacy-choice-1",
        "product-2",
      ),
    );
    expect(await screen.findByText("黑白胡椒蝦")).toBeInTheDocument();
  });
});
