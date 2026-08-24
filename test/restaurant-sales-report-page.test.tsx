import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RestaurantSalesReportPage } from "@/components/RestaurantSalesReportPage";
import i18n from "@/i18n";
import type { RestaurantSalesReportRow } from "@/lib/restaurant-sales-report";

const rows: RestaurantSalesReportRow[] = [
  {
    bucketStart: "2026-01-01",
    restaurantId: "ylp",
    restaurantName: "YLP 桂花小幸 元朗",
    restaurantOrder: 1,
    categoryKey: "shop_sales",
    categoryName: "店舖銷售",
    categoryOrder: -1000,
    amount: 788432,
  },
  {
    bucketStart: "2026-01-01",
    restaurantId: "ylp",
    restaurantName: "YLP 桂花小幸 元朗",
    restaurantOrder: 1,
    categoryKey: "foodpanda",
    categoryName: "Foodpanda",
    categoryOrder: 1,
    amount: 112344,
  },
];

const restaurants = [
  { id: "ylp", name: "YLP 桂花小幸 元朗" },
  { id: "tko", name: "TKO 桂花小幸 將軍澳" },
];

const loadRestaurants = async () => restaurants;

describe("RestaurantSalesReportPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("defaults to monthly platform sales from January through this month", async () => {
    const loadReport = vi.fn(async () => rows);
    render(
      <RestaurantSalesReportPage
        loadRestaurants={loadRestaurants}
        loadReport={loadReport}
      />,
    );

    expect(screen.getByRole("heading", { name: "銷售報告" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "每月" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "外賣平台" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() => expect(loadReport).toHaveBeenCalledOnce());
    expect(loadReport).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: `${new Date().getFullYear()}-01-01`,
        period: "month",
        category: "platform",
      }),
    );
    expect(
      await screen.findByRole("columnheader", { name: "YLP 桂花小幸 元朗" }),
    ).toBeInTheDocument();
    expect(screen.getByText("店舖銷售")).toBeInTheDocument();
    expect(screen.getByText("$900,776.00")).toBeInTheDocument();
  });

  it("hides the duplicate page heading when rendered inside the shop report tabs", () => {
    const { container } = render(
      <RestaurantSalesReportPage
        embedded
        loadRestaurants={loadRestaurants}
        loadReport={async () => []}
      />,
    );
    expect(
      screen.queryByRole("heading", { name: "銷售報告" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "每月" })).toBeInTheDocument();
    expect(container.querySelector(".restaurant-sales-page")).toHaveClass(
      "is-embedded",
    );
  });

  it("shows only the table skeleton while loading", () => {
    const { container } = render(
      <RestaurantSalesReportPage
        loadRestaurants={loadRestaurants}
        loadReport={() => new Promise(() => undefined)}
      />,
    );

    expect(container.querySelector(".content-skeleton-report-table")).toBeInTheDocument();
    expect(container.querySelector(".shop-order-summary")).not.toBeInTheDocument();
  });

  it("switches to daily ranges, weekly dates, and alternate categories", async () => {
    const user = userEvent.setup();
    const loadReport = vi.fn(async () => rows);
    render(
      <RestaurantSalesReportPage
        loadRestaurants={loadRestaurants}
        loadReport={loadReport}
      />,
    );
    await waitFor(() => expect(loadReport).toHaveBeenCalledOnce());

    await user.click(screen.getByRole("button", { name: "每日" }));
    expect(screen.getByRole("group", { name: "日期範圍" })).toBeInTheDocument();
    const startDate = screen.getByLabelText("開始日期");
    const endDate = screen.getByLabelText("結束日期");
    expect(startDate).not.toHaveAttribute("max");
    expect(endDate).not.toHaveAttribute("min");
    fireEvent.change(endDate, { target: { value: "2025-01-15" } });
    await waitFor(() =>
      expect(loadReport).toHaveBeenLastCalledWith(
        expect.objectContaining({
          period: "day",
          startDate: "2025-01-15",
          endDate: "2025-01-15",
        }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "每星期" }));
    expect(screen.getByLabelText("選擇該星期的任意一天")).toHaveAttribute(
      "type",
      "date",
    );
    await waitFor(() =>
      expect(loadReport).toHaveBeenLastCalledWith(
        expect.objectContaining({ period: "week" }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "部門" }));
    await waitFor(() =>
      expect(loadReport).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: "department" }),
      ),
    );
  });

  it("filters the report table by selected restaurants", async () => {
    const user = userEvent.setup();
    render(
      <RestaurantSalesReportPage
        loadRestaurants={loadRestaurants}
        loadReport={async () => rows}
      />,
    );

    expect(await screen.findByRole("combobox", { name: "餐廳" })).toBeInTheDocument();
    expect(await screen.findByText("$900,776.00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "YLP 桂花小幸 元朗" }));

    expect(await screen.findByText("所選條件沒有銷售資料。")).toBeInTheDocument();
    expect(screen.queryByText("$900,776.00")).not.toBeInTheDocument();
  });
});
