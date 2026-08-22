import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RestaurantDailySalesPage } from "@/components/RestaurantDailySalesPage";
import i18n from "@/i18n";
import {
  emptyRestaurantDailySalesRecord,
  hongKongDateValue,
  pickDefaultRestaurant,
  pickRestaurantSalesReceiptSource,
  type RestaurantDailySalesMasters,
} from "@/lib/restaurant-daily-sales";

vi.mock("@/auth/use-page-access", () => ({
  useCurrentPageAccess: () => ({ canAccess: () => true }),
}));

const masters: RestaurantDailySalesMasters = {
  restaurants: [
    { id: "ylp", legacyId: "ylp-legacy", name: "YLP 桂花小幸 元朗", sortOrder: 0 },
    { id: "tko", legacyId: "tko-legacy", name: "TKO 桂花小幸 將軍澳", sortOrder: 1 },
  ],
  paymentMethods: [{ id: "cash", name: "現金", sortOrder: 0 }],
  deliveryPlatforms: [{ id: "foodpanda", legacyId: "foodpanda-legacy", name: "Foodpanda", sortOrder: 0 }],
  departments: [
    { id: "restaurant", name: "餐廳", sortOrder: 0 },
    { id: "other", name: "其他 (如沒有請填$0)", sortOrder: 1 },
  ],
  servicePeriods: [{ id: "lunch", name: "午市", sortOrder: 0 }],
  newProducts: [{ id: "tea", name: "冬瓜茶", sortOrder: 0 }],
};

describe("restaurant daily sales input", () => {
  it("selects the Tseung Kwan O restaurant by default", () => {
    expect(pickDefaultRestaurant(masters.restaurants)?.id).toBe("tko");
  });

  it("formats imported timestamps using the Hong Kong business date", () => {
    expect(hongKongDateValue(new Date("2026-08-20T16:00:00.000Z"))).toBe("2026-08-21");
  });

  it("prefers the imported POS sheet image over the generic image field", () => {
    expect(pickRestaurantSalesReceiptSource(" //files.example.com/pos.jpg ", "https://example.com/image.jpg"))
      .toBe("//files.example.com/pos.jpg");
    expect(pickRestaurantSalesReceiptSource(null, " https://example.com/image.jpg "))
      .toBe("https://example.com/image.jpg");
  });

  it("defaults to TKO with no selected history record and a blank editor", async () => {
    await i18n.changeLanguage("zh-HK");
    const loadSales = vi.fn(async () => emptyRestaurantDailySalesRecord());

    render(
      <RestaurantDailySalesPage
        loadMasters={async () => masters}
        loadSales={loadSales}
        loadRecent={async () => []}
        checkRecordExists={async () => false}
      />,
    );

    const tko = await screen.findByRole("button", { name: "TKO 桂花小幸 將軍澳" });
    await waitFor(() => expect(tko).toHaveAttribute("aria-pressed", "true"));
    expect(await screen.findByText("尚未選擇銷售記錄")).toBeInTheDocument();
    expect(loadSales).not.toHaveBeenCalled();
  });

  it("shows a loading message before an empty recent-record response finishes", async () => {
    await i18n.changeLanguage("zh-HK");
    let resolveRecent!: (items: []) => void;
    const loadRecent = vi.fn(() => new Promise<[]>((resolve) => { resolveRecent = resolve; }));

    render(
      <RestaurantDailySalesPage
        loadMasters={async () => masters}
        loadRecent={loadRecent}
        checkRecordExists={async () => false}
      />,
    );

    expect(await screen.findByText("正在載入銷售記錄…")).toBeInTheDocument();
    resolveRecent([]);
    expect(await screen.findByText("暫時未有銷售記錄")).toBeInTheDocument();
  });

  it("opens the new-record picker and blocks an existing restaurant date", async () => {
    await i18n.changeLanguage("zh-HK");
    const user = userEvent.setup();
    render(
      <RestaurantDailySalesPage
        loadMasters={async () => masters}
        loadRecent={async () => []}
        checkRecordExists={async () => true}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "新增銷售記錄" }));
    expect(await screen.findByRole("dialog", { name: "新增餐廳銷售記錄" })).toBeInTheDocument();
    expect(await screen.findByText("此餐廳在所選日期已有記錄，請選擇其他日期。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "開始輸入" })).toBeDisabled();
  });

  it("shows the existing POS receipt when a history record is selected", async () => {
    await i18n.changeLanguage("zh-HK");
    const user = userEvent.setup();
    const loadSales = vi.fn(async () => ({
      ...emptyRestaurantDailySalesRecord(),
      total: 100,
      receiptPath: "https://example.com/pos.jpg",
      receiptUrl: "https://example.com/pos.jpg",
    }));
    render(
      <RestaurantDailySalesPage
        loadMasters={async () => masters}
        loadSales={loadSales}
        loadRecent={async () => [{ date: "2026-08-20", total: 100 }]}
        checkRecordExists={async () => false}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /2026-08-20/ }));
    expect(await screen.findByRole("img", { name: "機紙預覽" })).toHaveAttribute("src", "https://example.com/pos.jpg");
    expect(screen.getByRole("button", { name: "查看" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("spinbutton", { name: "總營業額" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "放大查看機紙" }));
    expect(await screen.findByRole("dialog", { name: "機紙預覽" })).toBeInTheDocument();
    expect(loadSales).toHaveBeenCalledWith("tko", "2026-08-20");
  });

  it("shows delivery-platform amounts and legacy department working hours", async () => {
    await i18n.changeLanguage("zh-HK");
    const user = userEvent.setup();
    render(
      <RestaurantDailySalesPage
        loadMasters={async () => masters}
        loadSales={async () => ({
          ...emptyRestaurantDailySalesRecord(),
          total: 5652,
          platformAmounts: { foodpanda: 5652 },
          workingHours: { "樓面": 36, "廚房": 12, "水吧": 8 },
        })}
        loadRecent={async () => [{ date: "2026-08-20", total: 5652 }]}
        checkRecordExists={async () => false}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /2026-08-20/ }));
    expect(await screen.findByLabelText("Foodpanda 銷售額")).toHaveTextContent("$5,652.00");
    expect(screen.getByLabelText("樓面 工時")).toHaveTextContent("36");
    expect(screen.getByLabelText("廚房 工時")).toHaveTextContent("12");
    expect(screen.getByLabelText("水吧 工時")).toHaveTextContent("8");
    expect(screen.getByText("56.00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "編輯" }));
    expect(screen.getByRole("button", { name: "編輯" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("spinbutton", { name: "Foodpanda 銷售額" })).toHaveValue(5652);
    expect(screen.getByRole("spinbutton", { name: "樓面 工時" })).toHaveValue(36);
  });

  it("filters the history list by a single Hong Kong business date", async () => {
    await i18n.changeLanguage("zh-HK");
    const user = userEvent.setup();
    const rows = [
      { date: "2026-08-21", total: 33651.8 },
      { date: "2026-08-20", total: 31212 },
    ];
    const loadRecent = vi.fn(async (_restaurantId: string, fromDate?: string, toDate?: string) =>
      rows.filter((row) => (!fromDate || row.date >= fromDate) && (!toDate || row.date <= toDate)),
    );
    render(
      <RestaurantDailySalesPage
        loadMasters={async () => masters}
        loadRecent={loadRecent}
        checkRecordExists={async () => false}
      />,
    );

    await user.selectOptions(await screen.findByLabelText("日期篩選"), "single");
    await user.type(screen.getByLabelText("篩選日期"), "2026-08-21");
    await waitFor(() => expect(loadRecent).toHaveBeenLastCalledWith("tko", "2026-08-21", "2026-08-21"));
    expect(await screen.findByRole("button", { name: /2026-08-21/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /2026-08-20/ })).not.toBeInTheDocument();
  });

  it("marks recent records whose sales breakdowns do not match the total", async () => {
    await i18n.changeLanguage("zh-HK");
    render(
      <RestaurantDailySalesPage
        loadMasters={async () => masters}
        loadRecent={async () => [{ date: "2026-08-17", total: 25974.4, hasMismatch: true, editedAt: "2026-08-17T13:21:00.000Z" }]}
        checkRecordExists={async () => false}
      />,
    );

    expect(await screen.findByLabelText("銷售分項合計與總營業額不相同")).toBeInTheDocument();
    expect(screen.getByText(/最近編輯於:/)).toBeInTheDocument();
  });

  it("requires totals, department sales, period sales, and a POS receipt before saving", async () => {
    await i18n.changeLanguage("zh-HK");
    const user = userEvent.setup();
    const saveSales = vi.fn(async () => undefined);
    render(
      <RestaurantDailySalesPage
        loadMasters={async () => masters}
        loadRecent={async () => []}
        checkRecordExists={async () => false}
        saveSales={saveSales}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "新增銷售記錄" }));
    const start = screen.getByRole("button", { name: "開始輸入" });
    await waitFor(() => expect(start).toBeEnabled());
    await user.click(start);
    await user.click(screen.getByRole("button", { name: "儲存銷售記錄" }));

    expect(screen.getByText("未填寫總營業額")).toBeInTheDocument();
    expect(screen.getByText("未填寫部門銷售額")).toBeInTheDocument();
    expect(screen.getByText("未填寫時段銷售額")).toBeInTheDocument();
    expect(screen.getByText("未上傳機紙")).toBeInTheDocument();
    expect(saveSales).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("總營業額"), "100");
    await user.type(screen.getByLabelText("現金 銷售額"), "100");
    await user.type(screen.getByLabelText("餐廳 銷售額"), "100");
    await user.type(screen.getByLabelText("午市 銷售額"), "100");
    await user.type(screen.getByLabelText("冬瓜茶 銷售數量"), "3");
    await user.type(screen.getByLabelText("當日收現金總數"), "120");
    await user.type(screen.getByLabelText("當日取零用金"), "20");
    const otherAmount = screen.getByRole("spinbutton", { name: "其他 (如沒有請填$0) 銷售額" });
    await user.type(otherAmount, "562.2");
    await user.selectOptions(screen.getByLabelText("其他 (如沒有請填$0) 加減"), "subtract");
    expect(otherAmount).toHaveValue(-562.2);
    await user.selectOptions(screen.getByLabelText("其他 (如沒有請填$0) 加減"), "add");
    expect(otherAmount).toHaveValue(562.2);
    await user.clear(otherAmount);
    await user.upload(screen.getByLabelText("上載機紙"), new File(["image"], "pos.jpg", { type: "image/jpeg" }));
    const saveButton = screen.getByRole("button", { name: "儲存銷售記錄" });
    expect(saveButton.closest(".daily-sales-receipt")).not.toBeNull();
    await user.click(saveButton);

    await waitFor(() => expect(saveSales).toHaveBeenCalledWith(expect.objectContaining({
      restaurantId: "tko",
      total: 100,
      paymentAmounts: { cash: 100 },
      departmentAmounts: expect.objectContaining({ restaurant: 100 }),
      periodAmounts: { lunch: 100 },
      productQuantities: { tea: 3 },
      realCashCountAmount: 120,
      pettyCashAmount: 20,
    })));
    expect(saveSales.mock.calls[0]?.[0].receiptFile?.name).toBe("pos.jpg");
    expect(await screen.findByText("已儲存")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("spinbutton", { name: "總營業額" })).not.toBeInTheDocument();
  });
});
