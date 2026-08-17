import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SellingPriceCostPage } from "@/components/SellingPriceCostPage";
import i18n from "@/i18n";
import {
  averageFactorySupplyPrice,
  computeSellingPriceCost,
  filterSellingPriceCostRows,
  formatSeasoningCode,
  formatSignedPercent,
  hongKongYearMonthKey,
  isHongKongYearMonth,
  type SellingPriceCostRow,
  type SellingPriceRawMeatOption,
} from "@/lib/selling-price-cost";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { app_metadata: { role: "Super Admin" } },
    profile: { role: "Super Admin" },
  }),
}));

const options: SellingPriceRawMeatOption[] = [
  { id: "raw-1", name: "豬肚", sortOrder: 1 },
  { id: "raw-2", name: "雞扒", sortOrder: 2 },
];

function row(
  partial: Partial<SellingPriceCostRow> & Pick<SellingPriceCostRow, "id">,
): SellingPriceCostRow {
  return {
    movementAt: "2023-11-09T16:00:00.000Z",
    productName: "燜豬肚條",
    rawMeatName: "豬肚",
    rawMeatWeightKg: 135.41,
    inboundUnitPrice: 33,
    seasoningCode: "20230911",
    seasoningPerKg: 0.78,
    seasoningCost: 105.6198,
    yieldKg: 96,
    yieldPercent: 0.709,
    totalCost: 4574.1498,
    markupRate: 0.05,
    yieldDifferencePerKg: 50.0295,
    variationRate: 0.15,
    listPricePerKg: 57.5339,
    ...partial,
  };
}

const bellyRows: SellingPriceCostRow[] = [
  row({ id: "row-1" }),
  row({
    id: "row-2",
    movementAt: "2024-01-10T16:00:00.000Z",
    productName: "滷豬肚",
    seasoningCode: "20240101",
  }),
];

const chickenRows: SellingPriceCostRow[] = Array.from(
  { length: 16 },
  (_, index) =>
    row({
      id: `chicken-${index + 1}`,
      productName: `醃雞扒 ${index + 1}`,
      rawMeatName: "雞扒",
      movementAt:
        index === 15
          ? "2026-04-30T16:00:00.000Z"
          : `2026-06-${String(16 - (index % 15)).padStart(2, "0")}T16:00:00.000Z`,
    }),
);

describe("selling price cost calculations", () => {
  it("matches the Bubble screenshot formulas", () => {
    const computed = computeSellingPriceCost({
      rawMeatWeightKg: 135.41,
      inboundUnitPrice: 33,
      seasoningPerKg: 0.78,
      yieldKg: 96,
      markupRate: 0.05,
      variationRate: 0.15,
    });

    expect(computed.seasoningCost).toBeCloseTo(105.62, 1);
    expect(computed.yieldPercent).toBeCloseTo(0.709, 3);
    expect(computed.totalCost).toBeCloseTo(4574.15, 1);
    expect(computed.yieldDifferencePerKg).toBeCloseTo(50.03, 2);
    expect(computed.listPricePerKg).toBeCloseTo(57.53, 2);
  });

  it("formats seasoning codes and rate badges", () => {
    expect(formatSeasoningCode(20230911)).toBe("20230911");
    expect(formatSeasoningCode(20250714.1)).toBe("20250714.1");
    expect(formatSignedPercent(0.05)).toBe("+5%");
    expect(formatSignedPercent(0.15)).toBe("+15%");
  });

  it("averages factory supply prices equally across priced rows", () => {
    expect(averageFactorySupplyPrice(bellyRows)).toBeCloseTo(54.7945, 3);
    expect(averageFactorySupplyPrice([])).toBeNull();
  });

  it("accepts only YYYY-MM keys for monthly push", () => {
    expect(isHongKongYearMonth("2026-07")).toBe(true);
    expect(isHongKongYearMonth("2026-13")).toBe(false);
    expect(isHongKongYearMonth(null)).toBe(false);
  });

  it("filters by search and Hong Kong month key", () => {
    expect(hongKongYearMonthKey("2023-11-09T16:00:00.000Z")).toBe("2023-11");
    expect(
      filterSellingPriceCostRows(bellyRows, "滷豬肚").map((item) => item.id),
    ).toEqual(["row-2"]);
    expect(
      filterSellingPriceCostRows(
        bellyRows,
        "",
        hongKongYearMonthKey("2023-11-09T16:00:00.000Z"),
      ).map((item) => item.id),
    ).toEqual(["row-1"]);
  });
});

describe("Selling price cost page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("shows left meat tabs, defaults to the first type, and supports search", async () => {
    const user = userEvent.setup();
    const loadOptions = vi.fn().mockResolvedValue(options);
    const loadRows = vi.fn().mockImplementation(async (id: string) => {
      if (id === "raw-1") return structuredClone(bellyRows);
      return structuredClone(chickenRows);
    });

    render(
      <MemoryRouter>
        <SellingPriceCostPage loadOptions={loadOptions} loadRows={loadRows} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "售價成本計算" }),
    ).toBeInTheDocument();

    const sidebar = screen.getByRole("complementary", { name: "生肉種類" });
    const tabs = within(sidebar).getByRole("tablist", { name: "生肉種類" });
    expect(within(tabs).getByRole("tab", { name: "豬肚" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(tabs).getByRole("tab", { name: "雞扒" })).toBeInTheDocument();

    await waitFor(() => {
      expect(loadRows).toHaveBeenCalledWith("raw-1");
    });

    expect(await screen.findByText("燜豬肚條")).toBeInTheDocument();
    expect(screen.getByText("滷豬肚")).toBeInTheDocument();
    expect(screen.getAllByText("(+5%)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("(+15%)").length).toBeGreaterThan(0);

    await user.type(
      screen.getByPlaceholderText("搜尋產品、生肉名稱、香料編號或日期"),
      "滷豬肚",
    );
    await user.click(screen.getByRole("button", { name: "搜尋" }));

    expect(await screen.findByText("滷豬肚")).toBeInTheDocument();
    expect(screen.queryByText("燜豬肚條")).not.toBeInTheDocument();
  });

  it("switches chips, paginates, and filters by month", async () => {
    const user = userEvent.setup();
    const loadOptions = vi.fn().mockResolvedValue(options);
    const loadRows = vi.fn().mockImplementation(async (id: string) => {
      if (id === "raw-1") return structuredClone(bellyRows);
      return structuredClone(chickenRows);
    });

    render(
      <MemoryRouter>
        <SellingPriceCostPage loadOptions={loadOptions} loadRows={loadRows} />
      </MemoryRouter>,
    );

    await screen.findByText("燜豬肚條");
    await user.click(screen.getByRole("tab", { name: "雞扒" }));

    await waitFor(() => {
      expect(loadRows).toHaveBeenCalledWith("raw-2");
    });

    expect(await screen.findByText("醃雞扒 1")).toBeInTheDocument();
    expect(screen.queryByText("醃雞扒 16")).not.toBeInTheDocument();
    expect(screen.getByText("顯示 1–15，共 16 筆")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一頁" }));
    expect(await screen.findByText("醃雞扒 16")).toBeInTheDocument();
    expect(screen.queryByText("醃雞扒 1")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "篩選月份" }));
    const listbox = await screen.findByRole("listbox", { name: "篩選月份" });
    expect(
      within(listbox).getByRole("option", { name: "全部月份" }),
    ).toBeInTheDocument();
    await user.click(within(listbox).getAllByRole("option")[1]!);

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "篩選月份" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "篩選月份" })).toHaveTextContent(
      /[A-Za-z]{3}-\d{2}/,
    );
  });

  it("hides the push button without permission", async () => {
    const loadOptions = vi.fn().mockResolvedValue(options);
    const loadRows = vi.fn().mockResolvedValue(structuredClone(bellyRows));

    render(
      <MemoryRouter>
        <SellingPriceCostPage
          loadOptions={loadOptions}
          loadRows={loadRows}
          canPush={false}
        />
      </MemoryRouter>,
    );

    await screen.findByText("燜豬肚條");
    expect(
      screen.queryByRole("button", { name: "傳送到報表" }),
    ).not.toBeInTheDocument();
  });

  it("hides send-to-report until a month is selected, then confirms the preview", async () => {
    const user = userEvent.setup();
    const loadOptions = vi.fn().mockResolvedValue(options);
    const loadRows = vi.fn().mockResolvedValue(structuredClone(bellyRows));
    const pushMonthlyPrices = vi.fn().mockResolvedValue({ status: "updated" });

    render(
      <MemoryRouter>
        <SellingPriceCostPage
          loadOptions={loadOptions}
          loadRows={loadRows}
          pushMonthlyPrices={pushMonthlyPrices}
          canPush
        />
      </MemoryRouter>,
    );

    await screen.findByText("燜豬肚條");
    expect(
      screen.queryByRole("button", { name: "傳送到報表" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "篩選月份" }));
    const listbox = await screen.findByRole("listbox", { name: "篩選月份" });
    await user.click(within(listbox).getByRole("option", { name: /Nov-23|11月/ }));

    const sendButton = await screen.findByRole("button", { name: "傳送到報表" });
    await user.click(sendButton);

    const dialog = await screen.findByRole("dialog", {
      name: "產品製作成本及工場用貨售價",
    });
    expect(within(dialog).getByText("產品製作成本及工場用貨售價")).toBeInTheDocument();
    expect(within(dialog).getByText(/\$54\.79/)).toBeInTheDocument();
    expect(pushMonthlyPrices).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(pushMonthlyPrices).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "傳送到報表" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "傳送到報表",
      }),
    );

    await waitFor(() => {
      expect(pushMonthlyPrices).toHaveBeenCalledWith("raw-1", "2023-11");
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "已傳送 Nov-23 到報表",
    );
  });
});
