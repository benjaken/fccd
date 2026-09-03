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
  cateringOther: null,
  cateringChannels: [
    {
      id: "Catering",
      name: "FCC",
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
      name: "Food Panda",
      values: {
        previousYearPreviousMonth: 40000,
        previousYearCurrentMonth: 50000,
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

  it("shows side-by-side YoY matrices with brand abbreviations", async () => {
    const loadDashboard = vi.fn().mockResolvedValue(liveData);
    render(
      <MemoryRouter>
        <Dashboard loadDashboard={loadDashboard} role="Super Admin" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("正在載入最新營運數據");
    expect(await screen.findByRole("heading", { name: "每月銷售總覽" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "本月對比" }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("heading", { name: "上月對比" }).length).toBeGreaterThanOrEqual(2);
    const tables = screen.getAllByRole("table");
    expect(tables).toHaveLength(4);
    expect(tables[0]).toHaveClass("is-this-month-table");
    expect(tables[1]).not.toHaveClass("is-this-month-table");
    expect(within(tables[0]).getByRole("columnheader", { name: "FCC" })).toBeInTheDocument();
    expect(within(tables[0]).getByRole("columnheader", { name: "Total" })).toBeInTheDocument();
    expect(within(tables[0]).getByRole("rowheader", { name: "2026年9月．累計中" })).toBeInTheDocument();
    expect(within(tables[0]).getAllByText("+33.3%")).toHaveLength(2);
    expect(within(tables[1]).getAllByText("+25.0%")).toHaveLength(2);
    expect(within(tables[2]).getByRole("columnheader", { name: "Food Panda" })).toBeInTheDocument();
    expect(within(tables[2]).getAllByText("+10.0%")).toHaveLength(2);
    expect(screen.queryByText("YLP 桂花小幸 元朗")).not.toBeInTheDocument();
    expect(document.querySelector(".home-sales-mini-bar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更新數據" })).not.toBeInTheDocument();
    expect(loadDashboard).toHaveBeenCalledWith("Super Admin");
    expect(tables[0].querySelectorAll(".home-sales-total-value")).not.toHaveLength(0);
    expect(tables[0].querySelectorAll(".home-sales-channel-value")).not.toHaveLength(0);
    const cards = document.querySelectorAll(".home-sales-channel-card");
    expect(cards).toHaveLength(4);
    expect(cards[0]).toHaveClass("is-total");
    expect(cards[1]).toHaveTextContent("FCC");
    expect(cards[1]).toHaveTextContent("本月對比");
    expect(cards[1]).toHaveTextContent("+33.3%");
    expect(cards[3]).toHaveTextContent("Food Panda");
    expect(cards[3]).toHaveTextContent("+10.0%");
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
    expect((await screen.findAllByRole("columnheader", { name: "FCC" })).length).toBeGreaterThan(0);
  });

  it("filters the first sales table by brand", async () => {
    const user = userEvent.setup();
    const dataWithBrands: HomeSalesDashboardData = {
      ...liveData,
      cateringChannels: [
        ...liveData.cateringChannels,
        {
          id: "Kitchen",
          name: "FCK",
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
    await user.selectOptions(brandFilter, "Kitchen");
    const cateringTable = screen.getAllByRole("table")[0];
    expect(within(cateringTable).getByRole("columnheader", { name: "FCK" })).toBeInTheDocument();
    expect(within(cateringTable).queryByRole("columnheader", { name: "FCC" })).not.toBeInTheDocument();
  });
});
