import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RestaurantNewProductReport } from "@/components/RestaurantNewProductReport";
import i18n from "@/i18n";
import { defaultNewProductReportDates } from "@/lib/restaurant-new-product-report";

const database = vi.hoisted(() => ({
  insert: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/auth/use-page-access", () => ({
  useCurrentPageAccess: () => ({ canAccess: () => true }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        is: () => query,
        order: () => query,
        insert: database.insert,
        then: (resolve: (value: { data: unknown[] }) => void) =>
          Promise.resolve({ data: [] }).then(resolve),
      };
      return query;
    },
  },
}));

describe("restaurant new product report", () => {
  it("defaults from January 1 through today", () => {
    expect(defaultNewProductReportDates(new Date(2026, 7, 21))).toEqual({
      startDate: "2026-01-01",
      endDate: "2026-08-21",
    });
  });

  it("renders the report table, pagination, and settings link", async () => {
    await i18n.changeLanguage("zh-HK");
    const loadReport = vi.fn(async () => ({
      rows: [{
        saleDate: "2026-08-20",
        productId: "product-1",
        productName: "新品叉燒飯",
        quantity: 27,
      }],
      total: 1,
    }));

    render(<RestaurantNewProductReport loadReport={loadReport} />);

    await waitFor(() => expect(loadReport).toHaveBeenCalledOnce());
    expect(loadReport).toHaveBeenCalledWith(expect.objectContaining({
      startDate: `${new Date().getFullYear()}-01-01`,
      page: 1,
      pageSize: 20,
    }));
    expect(screen.getByLabelText("開始日期")).toHaveValue(
      `${new Date().getFullYear()}-01-01`,
    );
    expect(screen.getByLabelText("結束日期")).toHaveValue(
      defaultNewProductReportDates().endDate,
    );
    expect(screen.getByRole("columnheader", { name: "日期" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "新品" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "賣出總數" })).toBeInTheDocument();
    expect(screen.getByText(
      `${new Date().getFullYear()}-01-01 — ${defaultNewProductReportDates().endDate}`,
    )).toBeInTheDocument();
    expect(await screen.findByText("新品叉燒飯")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新品設定" })).toBeInTheDocument();
    expect(screen.getByText("顯示 1–1，共 1 筆")).toBeInTheDocument();
  });

  it("opens the 80-percent settings panel and adds a product from a modal", async () => {
    const user = userEvent.setup();
    render(<RestaurantNewProductReport loadReport={async () => ({ rows: [], total: 0 })} />);

    await user.click(screen.getByRole("button", { name: "新品設定" }));
    const panel = screen.getByRole("dialog", { name: "新品設定" });
    expect(panel).toHaveClass("side-panel-majority");
    expect(within(panel).queryByText("管理餐廳新品及銷售輸入時使用的備註設定。")).not.toBeInTheDocument();
    expect(within(panel).getByRole("columnheader", { name: "新品名稱" })).toBeInTheDocument();
    expect(within(panel).getByRole("columnheader", { name: "備註欄" })).toBeInTheDocument();
    expect(within(panel).getByRole("columnheader", { name: "備註欄提示" })).toBeInTheDocument();
    expect(within(panel).getByRole("columnheader", { name: "狀態" })).toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "新增" }));
    const addDialog = screen.getByRole("dialog", { name: "新增新品" });
    await user.type(within(addDialog).getByPlaceholderText("輸入新品名稱"), "夏日新品");
    await user.click(within(addDialog).getByRole("button", { name: "新增" }));
    await waitFor(() => expect(database.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "夏日新品" }),
    ));
  });
});
