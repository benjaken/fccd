import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportsPage } from "@/components/ReportsPage";
import i18n from "@/i18n";

const reports = vi.hoisted(() => ({
  fetchMonthlyPreparedMeatStock: vi.fn(),
  fetchMonthlyPreparedMeatPrices: vi.fn(),
  fetchMonthlyRawMeatAveragePrices: vi.fn(),
  fetchMonthlyRawMeatStock: vi.fn(),
  fetchReportShops: vi.fn(),
  fetchReportSuppliers: vi.fn(),
  fetchShopOrderQuantities: vi.fn(),
  fetchSupplierPurchases: vi.fn(),
}));

vi.mock("@/lib/reports", () => ({
  fetchMonthlyPreparedMeatStock: reports.fetchMonthlyPreparedMeatStock,
  fetchMonthlyPreparedMeatPrices: reports.fetchMonthlyPreparedMeatPrices,
  fetchMonthlyRawMeatAveragePrices:
    reports.fetchMonthlyRawMeatAveragePrices,
  fetchMonthlyRawMeatStock: reports.fetchMonthlyRawMeatStock,
  fetchReportShops: reports.fetchReportShops,
  fetchReportSuppliers: reports.fetchReportSuppliers,
  fetchShopOrderQuantities: reports.fetchShopOrderQuantities,
  fetchSupplierPurchases: reports.fetchSupplierPurchases,
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { app_metadata: { role: "Super Admin" } },
    profile: { role: "Super Admin" },
  }),
}));

vi.mock("@/auth/use-page-access", async () => {
  const actual = await vi.importActual<typeof import("@/auth/use-page-access")>(
    "@/auth/use-page-access",
  );
  return {
    ...actual,
    usePageAccess: () => ({
      isSuperAdmin: true,
      loading: false,
      error: null,
      canAccess: () => true,
      canManage: () => true,
      canAccessSection: () => true,
    }),
  };
});

function renderReport(group: "frozenMeat" | "shops") {
  return render(<ReportsPage group={group} />);
}

describe("Shop order quantity report", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    reports.fetchReportShops.mockResolvedValue([
      { id: "tko", name: "桂花小幸 TKO" },
      { id: "ylp", name: "桂花小幸 YLP" },
    ]);
    reports.fetchShopOrderQuantities.mockResolvedValue([
      {
        orderDate: "2026-06-01",
        shopId: "tko",
        shopName: "桂花小幸 TKO",
        productId: "product-1",
        productName: "豉油雞中翼",
        unit: "包",
        totalQuantity: 12,
      },
      {
        orderDate: "2026-06-01",
        shopId: "tko",
        shopName: "桂花小幸 TKO",
        productId: "product-2",
        productName: "煎釀三寶",
        unit: "包",
        totalQuantity: 18,
      },
    ]);
    reports.fetchMonthlyPreparedMeatPrices.mockResolvedValue([
      {
        productId: "prepared-1",
        productName: "香菇滷肉",
        productUnit: "包",
        sortOrder: 1,
        monthNumber: 1,
        pricePerKg: 21.4,
        pricePerPackage: 42.8,
      },
      {
        productId: "prepared-1",
        productName: "香菇滷肉",
        productUnit: "包",
        sortOrder: 1,
        monthNumber: 2,
        pricePerKg: 21.4,
        pricePerPackage: 42.8,
      },
    ]);
    reports.fetchMonthlyRawMeatAveragePrices.mockResolvedValue([
      {
        rawMeatItemId: "raw-1",
        rawMeatName: "豬肉碎(扁食用) (生)",
        sortOrder: 1,
        monthNumber: 1,
        averagePricePerKg: 33.06,
        totalQuantityKg: 100,
        receiptCount: 2,
      },
      {
        rawMeatItemId: "raw-2",
        rawMeatName: "雞扒",
        sortOrder: 2,
        monthNumber: 1,
        averagePricePerKg: 18.73,
        totalQuantityKg: 200,
        receiptCount: 4,
      },
    ]);
    reports.fetchMonthlyPreparedMeatStock.mockResolvedValue([
      {
        preparedMeatItemId: "prepared-stock-1",
        preparedMeatName: "熟滷水牛展片",
        productUnit: "包",
        sortOrder: 1,
        monthNumber: 1,
        monthEndPackages: 35,
        monthlyNetPackages: -3,
      },
      {
        preparedMeatItemId: "prepared-stock-1",
        preparedMeatName: "熟滷水牛展片",
        productUnit: "包",
        sortOrder: 1,
        monthNumber: 2,
        monthEndPackages: 68,
        monthlyNetPackages: 33,
      },
      {
        preparedMeatItemId: "prepared-stock-2",
        preparedMeatName: "燜羊腩",
        productUnit: "包",
        sortOrder: 2,
        monthNumber: 1,
        monthEndPackages: -19,
        monthlyNetPackages: -5,
      },
      {
        preparedMeatItemId: "prepared-stock-2",
        preparedMeatName: "燜羊腩",
        productUnit: "包",
        sortOrder: 2,
        monthNumber: 2,
        monthEndPackages: -23,
        monthlyNetPackages: -4,
      },
    ]);
    reports.fetchMonthlyRawMeatStock.mockResolvedValue([
      {
        rawMeatItemId: "raw-stock-1",
        rawMeatName: "豬肉粒",
        productUnit: "kg",
        sortOrder: 1,
        monthNumber: 1,
        monthEndKg: 0,
        monthlyNetKg: 0,
      },
      {
        rawMeatItemId: "raw-stock-1",
        rawMeatName: "豬肉粒",
        productUnit: "kg",
        sortOrder: 1,
        monthNumber: 2,
        monthEndKg: 30.248,
        monthlyNetKg: 30.248,
      },
      {
        rawMeatItemId: "raw-stock-2",
        rawMeatName: "雞扒",
        productUnit: "kg",
        sortOrder: 2,
        monthNumber: 1,
        monthEndKg: 0,
        monthlyNetKg: -180.218,
      },
      {
        rawMeatItemId: "raw-stock-2",
        rawMeatName: "雞扒",
        productUnit: "kg",
        sortOrder: 2,
        monthNumber: 2,
        monthEndKg: 179.673,
        monthlyNetKg: 179.673,
      },
    ]);
    reports.fetchReportSuppliers.mockResolvedValue([
      { id: "sffm", name: "新豐凍肉 (SFFM)" },
      { id: "kc", name: "琪昌 (KC)" },
    ]);
    reports.fetchSupplierPurchases.mockResolvedValue([
      {
        supplierId: "sffm",
        supplierName: "新豐凍肉 (SFFM)",
        rawMeatItemId: "raw-beef-tendon",
        rawMeatName: "牛筋",
        quantityKg: 150.18,
        purchaseAmount: 4468.5,
        averagePricePerKg: 29.75,
      },
      {
        supplierId: "sffm",
        supplierName: "新豐凍肉 (SFFM)",
        rawMeatItemId: "raw-pork-chop",
        rawMeatName: "帶骨豬扒",
        quantityKg: 240.11,
        purchaseAmount: 5556.6,
        averagePricePerKg: 23.14,
      },
    ]);
  });

  it("renders migrated quantity rows and total", async () => {
    renderReport("shops");

    expect(
      await screen.findByRole("heading", { name: "Shop order quantities" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("豉油雞中翼")).toBeInTheDocument();
    expect(screen.getByText("煎釀三寶")).toBeInTheDocument();
    expect(screen.getByText("Product quantity ranking")).toBeInTheDocument();
    expect(screen.getByText("Product types")).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
    expect(screen.getAllByText("30").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeEnabled();
  });

  it("automatically queries after a single shop or date change", async () => {
    const user = userEvent.setup();
    renderReport("shops");
    await screen.findByText("豉油雞中翼");

    await user.click(screen.getByRole("button", { name: "桂花小幸 TKO" }));
    const start = screen.getByLabelText("Start date");
    const end = screen.getByLabelText("End date");
    await user.clear(start);
    await user.type(start, "2026-06-01");
    await user.clear(end);
    await user.type(end, "2026-06-30");
    await waitFor(() =>
      expect(reports.fetchShopOrderQuantities).toHaveBeenLastCalledWith({
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        shopIds: ["tko"],
      }),
    );
  });

  it("switches between monthly shop and factory prices", async () => {
    const user = userEvent.setup();
    renderReport("frozenMeat");

    await user.click(
      screen.getByRole("button", { name: "Average supply price by shop" }),
    );
    expect((await screen.findAllByText("香菇滷肉")).length).toBeGreaterThan(1);
    await waitFor(() =>
      expect(reports.fetchMonthlyPreparedMeatPrices).toHaveBeenLastCalledWith({
        year: new Date().getFullYear(),
        mode: "shop",
      }),
    );
    expect(screen.getByText("Latest month")).toBeInTheDocument();
    expect(screen.getByText("Missing prices")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "香菇滷肉 price trend" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Expand monthly matrix").closest("details"),
    ).toHaveAttribute("open");
    expect(screen.getAllByText("$21.40").length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole("button", { name: "Per package" }));
    expect(screen.getAllByText("$42.80").length).toBeGreaterThanOrEqual(2);

    await user.click(
      screen.getByRole("button", {
        name: "Production cost and factory supply price",
      }),
    );
    await waitFor(() =>
      expect(reports.fetchMonthlyPreparedMeatPrices).toHaveBeenLastCalledWith({
        year: new Date().getFullYear(),
        mode: "factory",
      }),
    );
  });

  it("renders weighted monthly raw-meat purchase prices", async () => {
    const user = userEvent.setup();
    const tabLabel = i18n.t("reports.tabs.rawMeatAveragePrice");
    renderReport("frozenMeat");

    await user.click(
      await screen.findByRole("button", {
        name: tabLabel,
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: tabLabel,
      }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        reports.fetchMonthlyRawMeatAveragePrices,
      ).toHaveBeenLastCalledWith(new Date().getFullYear()),
    );
    expect(
      screen.getAllByText("豬肉碎(扁食用) (生)").length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("雞扒").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("$33.06").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("$18.73").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByText("Data updated through month 1").length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(i18n.t("reports.rawMeatTypes"))).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: i18n.t("reports.rawMeatProductPriceTrend", {
          product: "豬肉碎(扁食用) (生)",
        }),
      }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByText(i18n.t("reports.expandMonthlyMatrix"))
        .closest("details"),
    ).toHaveAttribute("open");

    await user.click(screen.getByRole("button", { name: /雞扒/ }));
    expect(
      screen.getByRole("img", {
        name: i18n.t("reports.rawMeatProductPriceTrend", {
          product: "雞扒",
        }),
      }),
    ).toBeInTheDocument();
  });

  it("renders cumulative month-end prepared-meat stock", async () => {
    const user = userEvent.setup();
    const tabLabel = i18n.t("reports.tabs.preparedMeatStock");
    renderReport("frozenMeat");

    await user.click(
      await screen.findByRole("button", {
        name: tabLabel,
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: tabLabel,
      }),
    ).toBeInTheDocument();
    expect(reports.fetchMonthlyPreparedMeatStock).toHaveBeenLastCalledWith(
      new Date().getFullYear(),
    );
    expect(screen.getAllByText("熟滷水牛展片").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("燜羊腩").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByText("Data updated through month 2").length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByRole("img", {
        name: i18n.t("reports.preparedProductStockTrend", {
          product: "熟滷水牛展片",
        }),
      }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByText(i18n.t("reports.expandMonthlyMatrix"))
        .closest("details"),
    ).toHaveAttribute("open");

    await user.click(screen.getByRole("button", { name: /燜羊腩/ }));
    expect(
      screen.getByRole("img", {
        name: i18n.t("reports.preparedProductStockTrend", {
          product: "燜羊腩",
        }),
      }),
    ).toBeInTheDocument();
  });

  it("renders cumulative raw-meat stock in KG", async () => {
    const user = userEvent.setup();
    const tabLabel = i18n.t("reports.tabs.rawMeatStock");
    renderReport("frozenMeat");

    await user.click(
      await screen.findByRole("button", {
        name: tabLabel,
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: tabLabel,
      }),
    ).toBeInTheDocument();
    expect(reports.fetchMonthlyRawMeatStock).toHaveBeenLastCalledWith(
      new Date().getFullYear(),
    );
    expect(screen.getAllByText("豬肉粒").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("雞扒").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByRole("img", {
        name: i18n.t("reports.rawMeatStockTrend", {
          product: "豬肉粒",
        }),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Data updated through month 2").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("renders supplier purchase totals for the selected date range", async () => {
    const user = userEvent.setup();
    const tabLabel = i18n.t("reports.tabs.supplierPurchase");
    renderReport("frozenMeat");

    await user.click(
      await screen.findByRole("button", {
        name: tabLabel,
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: tabLabel,
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText("牛筋")).toBeInTheDocument();
    expect(screen.getByText("帶骨豬扒")).toBeInTheDocument();
    expect(screen.getAllByText("150.18 KG").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$10,025.10").length).toBeGreaterThanOrEqual(1);
    expect(reports.fetchReportSuppliers).toHaveBeenCalledOnce();
    expect(reports.fetchSupplierPurchases).toHaveBeenCalledWith(
      expect.objectContaining({ supplierIds: ["sffm"] }),
    );

    await user.click(screen.getByRole("button", { name: "琪昌 (KC)" }));
    await waitFor(() =>
      expect(reports.fetchSupplierPurchases).toHaveBeenLastCalledWith(
        expect.objectContaining({ supplierIds: ["kc"] }),
      ),
    );
  });

  it("lets shared item selectors scroll through the final row", () => {
    const stylesheet = readFileSync(
      path.resolve(process.cwd(), "src/index.css"),
      "utf8",
    );
    const panelRule = stylesheet.match(
      /\.meat-price-product-browser\s*\{([^}]+)\}/,
    );
    const listRule = stylesheet.match(
      /\.meat-price-product-list\s*\{([^}]+)\}/,
    );

    expect(panelRule?.[1]).toContain(
      "grid-template-rows: auto minmax(0, 1fr)",
    );
    expect(listRule?.[1]).toContain("min-height: 0");
    expect(listRule?.[1]).not.toContain("height: 405px");
  });

  it("keeps frozen-meat and shop reports on separate pages", async () => {
    const { unmount } = renderReport("shops");

    expect(
      await screen.findByRole("heading", { name: "Shops" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Average supply price by shop",
      }),
    ).not.toBeInTheDocument();
    unmount();

    renderReport("frozenMeat");
    expect(
      await screen.findByRole("heading", { name: "Frozen Meat" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Shop order quantities" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Average supply price by shop",
      }),
    ).toBeInTheDocument();
  });
});
