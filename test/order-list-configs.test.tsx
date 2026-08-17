import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrderListConfigsPage } from "@/components/settings/OrderListConfigsPage";
import i18n from "@/i18n";
import {
  canHideOrderList,
  filterOrderListConfigs,
  isOrderListNavVisible,
  orderListNavLabel,
  type OrderListConfigRow,
} from "@/lib/order-list-configs";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { app_metadata: { role: "Super Admin" } },
    profile: { role: "Super Admin" },
  }),
}));

const rows: OrderListConfigRow[] = [
  {
    id: "cfg-all",
    presetKey: "all",
    title: "所有訂單",
    description: "查看全部已確認到會訂單。",
    sortOrder: 10,
    isVisible: true,
    route: "/orders",
  },
  {
    id: "cfg-monthly",
    presetKey: "monthly-settlement",
    title: "月結",
    description: "已標示月結的訂單。",
    sortOrder: 40,
    isVisible: false,
    route: "/orders/monthly",
  },
];

describe("order list config helpers", () => {
  it("keeps 所有訂單 visible in the sidebar", () => {
    expect(canHideOrderList("all")).toBe(false);
    expect(canHideOrderList("monthly-settlement")).toBe(true);
  });

  it("filters configs by title or description", () => {
    expect(filterOrderListConfigs(rows, { search: "月結" }).map((row) => row.id)).toEqual([
      "cfg-monthly",
    ]);
    expect(filterOrderListConfigs(rows, { search: "確認" }).map((row) => row.id)).toEqual([
      "cfg-all",
    ]);
  });

  it("uses configured titles and visibility for order nav keys", () => {
    const configs = new Map(rows.map((row) => [row.presetKey, row]));
    expect(orderListNavLabel("monthlyOrders", configs, "月結")).toBe("月結");
    expect(orderListNavLabel("payments", configs, "收款到賬")).toBe("收款到賬");
    expect(isOrderListNavVisible("monthlyOrders", rows)).toBe(false);
    expect(isOrderListNavVisible("allOrders", rows)).toBe(true);
    expect(isOrderListNavVisible("payments", rows)).toBe(true);
  });
});

describe("Order list configs page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("lists configs and saves an edited explanation", async () => {
    const user = userEvent.setup();
    const loadConfigs = vi.fn().mockResolvedValue(structuredClone(rows));
    const updateConfig = vi.fn().mockResolvedValue({
      ...rows[1],
      description: "月結客戶對賬用。",
    });

    render(
      <MemoryRouter>
        <OrderListConfigsPage
          loadConfigs={loadConfigs}
          updateConfig={updateConfig}
          canEdit
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "訂單列表設定" }),
    ).toBeInTheDocument();
    expect(screen.getByText("查看全部已確認到會訂單。")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "編輯" })[1]);
    const description = await screen.findByLabelText("列表說明");
    await user.clear(description);
    await user.type(description, "月結客戶對賬用。");
    await user.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() =>
      expect(updateConfig).toHaveBeenCalledWith("cfg-monthly", {
        title: "月結",
        description: "月結客戶對賬用。",
        isVisible: false,
      }),
    );
  });
});
