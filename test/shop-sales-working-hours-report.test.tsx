import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ShopSalesWorkingHoursReport } from "@/components/ShopSalesWorkingHoursReport";
import {
  buildShopSalesWorkingHoursTables,
  type ShopSalesWorkingHoursRow,
} from "@/lib/shop-sales-working-hours-report";
import i18n from "@/i18n";

const rows: ShopSalesWorkingHoursRow[] = [
  {
    reportDate: "2026-08-19",
    restaurantId: "tko",
    restaurantName: "TKO 桂花小幸 將軍澳",
    departmentName: "樓面",
    departmentOrder: 1,
    sales: 29170.3,
    workingHours: 37,
    salesPerWorkingHour: 788.39,
  },
  {
    reportDate: "2026-08-19",
    restaurantId: "tko",
    restaurantName: "TKO 桂花小幸 將軍澳",
    departmentName: "廚房",
    departmentOrder: 2,
    sales: 27114.3,
    workingHours: 39,
    salesPerWorkingHour: 695.24,
  },
  {
    reportDate: "2026-08-20",
    restaurantId: "tko",
    restaurantName: "TKO 桂花小幸 將軍澳",
    departmentName: "樓面",
    departmentOrder: 1,
    sales: 36000,
    workingHours: 36,
    salesPerWorkingHour: 1000,
  },
  {
    reportDate: "2026-08-20",
    restaurantId: "tko",
    restaurantName: "TKO 桂花小幸 將軍澳",
    departmentName: "廚房",
    departmentOrder: 2,
    sales: 25000,
    workingHours: 50,
    salesPerWorkingHour: 500,
  },
  {
    reportDate: "2026-08-19",
    restaurantId: "ylp",
    restaurantName: "YLP 桂花小幸 元朗",
    departmentName: "樓面",
    departmentOrder: 1,
    sales: 31038.8,
    workingHours: 53.5,
    salesPerWorkingHour: 580.16,
  },
];

describe("Shop sales and working-hours report", () => {
  it("builds one independent table per selected shop", () => {
    const tables = buildShopSalesWorkingHoursTables(rows, [
      { id: "tko", name: "TKO 桂花小幸 將軍澳" },
      { id: "ylp", name: "YLP 桂花小幸 元朗" },
    ]);

    expect(tables).toHaveLength(2);
    expect(tables[0].dates[0]).toMatchObject({
      totalSales: 29170.3,
      totalWorkingHours: 76,
    });
    expect(tables[0].summaries[0]).toMatchObject({
      departmentName: "樓面",
      maximum: 1000,
      minimum: 788.39,
    });
    expect(tables[0].summaries[0].average).toBeCloseTo(894.195);
    expect(tables[1].departments.map((item) => item.name)).toEqual(["樓面"]);
  });

  it("loads all shops by default and renders a table for each one", async () => {
    await i18n.changeLanguage("en");
    const loadRestaurants = vi.fn().mockResolvedValue([
      { id: "tko", name: "TKO 桂花小幸 將軍澳" },
      { id: "ylp", name: "YLP 桂花小幸 元朗" },
    ]);
    const loadReport = vi.fn().mockResolvedValue(rows);

    const { container } = render(
      <ShopSalesWorkingHoursReport
        loadRestaurants={loadRestaurants}
        loadReport={loadReport}
      />,
    );

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "TKO 桂花小幸 將軍澳",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "YLP 桂花小幸 元朗",
      }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".shop-sales-hours-table")).toHaveLength(2);
    expect(
      screen.getByRole("complementary", {
        name: "Daily sales-per-hour summary",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("$1,000.00").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("$36,000.00 / 36hrs")).toBeInTheDocument();
    expect(screen.getByText("$1,000.00 / hr")).toBeInTheDocument();
    await waitFor(() =>
      expect(loadReport).toHaveBeenCalledWith(
        expect.objectContaining({ restaurantIds: ["tko", "ylp"] }),
      ),
    );
  });
});
