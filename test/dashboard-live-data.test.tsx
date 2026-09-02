import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Dashboard } from "@/App";
import i18n from "@/i18n";
import type { HomeSalesDashboardData } from "@/lib/home-sales-dashboard";

const liveData: HomeSalesDashboardData = {
  asOfDate: "2026-09-01",
  periods: [
    { key: "previousYearPreviousMonth", year: 2025, month: 8, startDate: "2025-08-01", endDate: "2025-08-31" },
    { key: "previousYearCurrentMonth", year: 2025, month: 9, startDate: "2025-09-01", endDate: "2025-09-30" },
    { key: "previousMonth", year: 2026, month: 8, startDate: "2026-08-01", endDate: "2026-08-31" },
    { key: "currentMonth", year: 2026, month: 9, startDate: "2026-09-01", endDate: "2026-09-30" },
  ],
  cateringChannels: [
    {
      id: "catering",
      name: "Catering",
      values: {
        previousYearPreviousMonth: 80000,
        previousYearCurrentMonth: 90000,
        previousMonth: 100000,
        currentMonth: 120000,
      },
    },
  ],
  tkoChannels: [
    {
      id: "foodpanda",
      name: "Foodpanda",
      values: {
        previousYearPreviousMonth: 0,
        previousYearCurrentMonth: 0,
        previousMonth: 50000,
        currentMonth: 55000,
      },
    },
  ],
};

describe("monthly sales dashboard", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("shows catering YoY comparisons and TKO channel month comparison without charts", async () => {
    const loadDashboard = vi.fn().mockResolvedValue(liveData);
    render(
      <MemoryRouter>
        <Dashboard loadDashboard={loadDashboard} role="Super Admin" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("正在載入最新營運數據");
    expect(await screen.findByRole("heading", { name: "每月銷售總覽" })).toBeInTheDocument();
    const tables = screen.getAllByRole("table");
    expect(within(tables[0]).getByText("Catering")).toBeInTheDocument();
    expect(within(tables[0]).getByText("上月（跨年比較）")).toBeInTheDocument();
    expect(within(tables[0]).getAllByText("+25.0%")).toHaveLength(2);
    expect(within(tables[0]).getAllByText("+33.3%")).toHaveLength(2);
    expect(within(tables[1]).getByText("Foodpanda")).toBeInTheDocument();
    expect(within(tables[1]).getAllByText("+10.0%")).toHaveLength(2);
    expect(screen.getAllByText("總額")).toHaveLength(2);
    expect(screen.queryByText("YLP 桂花小幸 元朗")).not.toBeInTheDocument();
    expect(document.querySelector(".home-sales-mini-bar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更新數據" })).not.toBeInTheDocument();
    expect(loadDashboard).toHaveBeenCalledWith("Super Admin");
  });

  it("offers a retry after a dashboard query fails", async () => {
    const user = userEvent.setup();
    const loadDashboard = vi
      .fn()
      .mockRejectedValueOnce(new Error("dashboard_failed"))
      .mockResolvedValueOnce(liveData);
    render(
      <MemoryRouter>
        <Dashboard loadDashboard={loadDashboard} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("暫時無法載入首頁數據")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重試" }));
    await waitFor(() => expect(loadDashboard).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("rowheader", { name: "Catering" })).toBeInTheDocument();
  });

  it("filters the first sales table by brand", async () => {
    const user = userEvent.setup();
    const dataWithBrands: HomeSalesDashboardData = {
      ...liveData,
      cateringChannels: [
        ...liveData.cateringChannels,
        {
          id: "kitchen",
          name: "Kitchen",
          values: {
            previousYearPreviousMonth: 10,
            previousYearCurrentMonth: 20,
            previousMonth: 30,
            currentMonth: 40,
          },
        },
      ],
    };
    render(
      <MemoryRouter>
        <Dashboard loadDashboard={() => Promise.resolve(dataWithBrands)} />
      </MemoryRouter>,
    );

    const brandFilter = await screen.findByRole("combobox", { name: "篩選品牌" });
    await user.selectOptions(brandFilter, "kitchen");
    const cateringTable = screen.getAllByRole("table")[0];
    expect(within(cateringTable).getByRole("rowheader", { name: "Kitchen" })).toBeInTheDocument();
    expect(within(cateringTable).queryByRole("rowheader", { name: "Catering" })).not.toBeInTheDocument();
  });
});
