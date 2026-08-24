import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { RestaurantMonthlyExpensesPage } from "@/components/RestaurantMonthlyExpensesPage";
import i18n from "@/i18n";
import type { RestaurantMonthlyExpenseMasters } from "@/lib/restaurant-monthly-expenses";

vi.mock("@/auth/use-page-access", () => ({
  useCurrentPageAccess: () => ({ canAccess: () => true }),
}));

const masters: RestaurantMonthlyExpenseMasters = {
  restaurants: [
    { id: "tko", name: "TKO 桂花小幸 將軍澳" },
    { id: "ylp", name: "YLP 桂花小幸 元朗" },
  ],
  costs: [
    { id: "rent", legacyId: "rent-legacy", name: "租金、管理費、冷氣費", sortOrder: 1, costTypeId: "lease", costTypeLegacyId: "lease-legacy", categoryName: "租金", categorySortOrder: 1 },
    { id: "salary", legacyId: "salary-legacy", name: "員工薪金", sortOrder: 1, costTypeId: "staff", costTypeLegacyId: "staff-legacy", categoryName: "員工成本", categorySortOrder: 2 },
  ],
};

const recent = [{
  restaurantId: "tko",
  restaurantName: "TKO 桂花小幸 將軍澳",
  month: "2026-07",
  total: 456_000,
  canProceedPnl: false,
  modifiedAt: "2026-08-22T01:00:00Z",
}];

describe("restaurant monthly expense input", () => {
  it("starts without a selected month and blocks an existing restaurant-month combination", async () => {
    await i18n.changeLanguage("zh-HK");
    const user = userEvent.setup();
    const checkRecordExists = vi.fn(async () => false);
    render(
      <RestaurantMonthlyExpensesPage
        loadMasters={async () => masters}
        loadRecent={async () => recent}
        checkRecordExists={checkRecordExists}
      />,
    );

    expect(await screen.findByText("尚未選擇月份")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "新增每月費用記錄" }));
    const currentMonthParts = new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Hong_Kong",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date());
    const currentMonth = `${currentMonthParts.find((part) => part.type === "year")?.value}-${currentMonthParts.find((part) => part.type === "month")?.value}`;
    expect(screen.getByLabelText("餐廳")).toHaveValue("tko");
    expect(screen.getByLabelText("月份")).toHaveValue(currentMonth);
    fireEvent.change(screen.getByLabelText("月份"), { target: { value: "2026-07" } });
    expect(await screen.findByText("此餐廳在所選月份已有資料，請選擇其他月份或餐廳。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "開始輸入" })).toBeDisabled();
    expect(checkRecordExists).toHaveBeenCalledWith("tko", currentMonth);
  });

  it("opens existing records in view mode, enables editing, and confirms P&L", async () => {
    await i18n.changeLanguage("zh-HK");
    const user = userEvent.setup();
    const loadRecord = vi.fn(async () => ({
      amounts: { rent: 144_561, salary: 311_439 },
      remarks: { rent: "Rent $106,000" },
      canProceedPnl: false,
    }));
    const setPnlStatus = vi.fn(async () => undefined);
    render(
      <RestaurantMonthlyExpensesPage
        loadMasters={async () => masters}
        loadRecent={async () => recent}
        loadRecord={loadRecord}
        setPnlStatus={setPnlStatus}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /^TKO 桂花小幸 將軍澳/ }));
    expect(await screen.findByLabelText("租金、管理費、冷氣費 金額")).toHaveTextContent("$144,561.00");
    expect(screen.getByRole("button", { name: "查看" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("spinbutton", { name: "員工薪金 金額" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "編輯" }));
    expect(screen.getByRole("spinbutton", { name: "員工薪金 金額" })).toHaveValue(311439);
    await user.click(screen.getByRole("button", { name: "查看" }));
    await waitFor(() => expect(screen.queryByRole("spinbutton", { name: "員工薪金 金額" })).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "確定生成 P&L" }));
    await waitFor(() => expect(setPnlStatus).toHaveBeenCalledWith("tko", "2026-07", true));
    expect(await screen.findByText("已納入 P&L")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "取消生成 P&L" }));
    await waitFor(() => expect(setPnlStatus).toHaveBeenLastCalledWith("tko", "2026-07", false));
    expect(await screen.findByText("尚未生成 P&L")).toBeInTheDocument();
  });

  it("saves a new month then returns to view mode", async () => {
    await i18n.changeLanguage("zh-HK");
    const user = userEvent.setup();
    const saveRecord = vi.fn(async () => undefined);
    render(
      <RestaurantMonthlyExpensesPage
        loadMasters={async () => masters}
        loadRecent={async () => []}
        checkRecordExists={async () => false}
        saveRecord={saveRecord}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "新增每月費用記錄" }));
    await user.selectOptions(screen.getByLabelText("餐廳"), "ylp");
    fireEvent.change(screen.getByLabelText("月份"), { target: { value: "2026-08" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "開始輸入" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "開始輸入" }));
    await user.type(screen.getByRole("spinbutton", { name: "租金、管理費、冷氣費 金額" }), "106000");
    await user.type(screen.getByLabelText("租金、管理費、冷氣費 備註"), "August rent");
    await user.click(screen.getByRole("button", { name: "儲存費用記錄" }));

    await waitFor(() => expect(saveRecord).toHaveBeenCalledWith(expect.objectContaining({
      restaurantId: "ylp",
      month: "2026-08",
      amounts: expect.objectContaining({ rent: 106000 }),
      remarks: expect.objectContaining({ rent: "August rent" }),
      canProceedPnl: false,
    })));
    expect(await screen.findByText("已儲存")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the latest edit time and confirms before deleting a record", async () => {
    await i18n.changeLanguage("zh-HK");
    const user = userEvent.setup();
    const deleteRecord = vi.fn(async () => undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <RestaurantMonthlyExpensesPage
        loadMasters={async () => masters}
        loadRecent={async () => recent}
        deleteRecord={deleteRecord}
      />,
    );

    expect(await screen.findByText(/最近編輯於：/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "刪除 TKO 桂花小幸 將軍澳 2026-07 的每月費用記錄" }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("確定刪除 TKO 桂花小幸 將軍澳 2026-07"));
    await waitFor(() => expect(deleteRecord).toHaveBeenCalledWith("tko", "2026-07"));
    expect(await screen.findByText("暫時未有每月費用記錄")).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("filters P&L monthly costs by the confirmation flag", () => {
    const sql = readFileSync("supabase/migrations/20260822121000_restaurant_pnl_confirmed_monthly_expenses.sql", "utf8");
    expect(sql).toContain("and monthly.can_proceed_pnl");
  });
});
