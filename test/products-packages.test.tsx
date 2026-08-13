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
import type { ProductDetail, ProductListResult } from "@/lib/products";

const productResult: ProductListResult = {
  total: 1,
  items: [
    {
      id: "product-1",
      sku: "CC-001",
      name: "Roast Chicken",
      chineseName: "燒雞",
      price: 188,
      status: "active",
      isActive: true,
      channelName: "Catering",
      productTypeName: "西式熱盤",
      updatedAt: "2026-08-12T01:00:00.000Z",
    },
  ],
};

const productDetail: ProductDetail = {
  id: "product-1",
  sku: "CC-001",
  name: "Roast Chicken",
  chineseName: "燒雞",
  description: "經典到會燒雞",
  imageUrl: null,
  price: 188,
  priceMin: 168,
  priceMax: 208,
  status: "active",
  isActive: true,
  isBentoRecommended: false,
  channelName: "Catering",
  productTypeName: "西式熱盤",
  cookTypeName: "焗",
  bentoMainTypeName: null,
  bentoColumnTypeName: null,
  collections: ["西式熱盤"],
  updatedAt: "2026-08-12T01:00:00.000Z",
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
      status: "active",
      isActive: true,
      channelName: "Catering",
      memberCount: 9,
      updatedAt: "2026-08-12T01:00:00.000Z",
    },
  ],
};

const packageDetail: PackageDetail = {
  id: "package-1",
  sku: "CCFA0406",
  name: "Family Feast",
  chineseName: "精緻家庭美宴 (4-6人)",
  description: "適合家庭聚會",
  price: 1280,
  status: "active",
  isActive: true,
  channelName: "Catering",
  updatedAt: "2026-08-12T01:00:00.000Z",
  members: [
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
    },
  ],
  choiceSets: [
    {
      id: "choice-1",
      choiceType: "中式小菜",
      maximumChoices: 2,
    },
  ],
};

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
    expect(await screen.findByText("CC-001")).toHaveAttribute(
      "href",
      "/products/product-1",
    );
    expect(screen.getByText("燒雞")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("Catering")).toBeInTheDocument();
    expect(screen.getByText("HK$188")).toBeInTheDocument();
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
        status: "",
        priceRange: "",
        preset: "all",
      }),
    );
  });

  it("filters by price range, channel, and status dropdowns", async () => {
    const user = userEvent.setup();
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

    await user.selectOptions(screen.getByLabelText("狀態"), "Active");
    await waitFor(() =>
      expect(loadProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: "Active",
          channelId: "channel-1",
          priceRange: "100-299",
          page: 1,
        }),
      ),
    );

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
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
    expect(screen.getByText("焗")).toBeInTheDocument();
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
    expect(await screen.findByText("CCFA0406")).toHaveAttribute(
      "href",
      "/products/packages/package-1",
    );
    expect(screen.getByText("精緻家庭美宴 (4-6人)")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("HK$1,280")).toBeInTheDocument();
  });

  it("renders package members and choice sets", async () => {
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
    expect(screen.getByText("燒雞")).toBeInTheDocument();
    expect(screen.getByText("CC-001")).toHaveAttribute(
      "href",
      "/products/product-1",
    );
  });
});
