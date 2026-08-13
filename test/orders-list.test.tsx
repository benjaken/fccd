import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrdersListPage } from "@/components/OrdersListPage";
import i18n from "@/i18n";
import type { OrderListResult } from "@/lib/orders";

const orderResult: OrderListResult = {
  total: 1,
  items: [
    {
      id: "order-1",
      orderNumber: "B-1513",
      customerName: "陳小姐",
      companyName: "香港女童軍總會",
      deliveryAt: "2026-08-12T00:00:00+08:00",
      shipOutTime: "11:30",
      deliveryStatus: "待取貨",
      isSentToFactory: null,
      grandTotal: 1610,
      outstanding: 1610,
      currency: "HKD",
      updatedAt: "2026-08-12T01:00:00.000Z",
    },
  ],
};

describe("Orders list", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("renders migrated order snapshots and finance fields", async () => {
    const loadOrders = vi.fn().mockResolvedValue(orderResult);

    render(
      <MemoryRouter>
        <OrdersListPage loadOrders={loadOrders} canViewFinance />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "所有訂單" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("B-1513")).toHaveAttribute(
      "href",
      "/orders/order-1",
    );
    const table = within(screen.getByRole("table"));
    expect(table.getByText("香港女童軍總會")).toBeInTheDocument();
    expect(table.getByText("陳小姐")).toBeInTheDocument();
    expect(table.getByText("待取貨")).toBeInTheDocument();
    expect(table.getAllByText("HK$1,610")).toHaveLength(2);
  });

  it("submits search and semantic status filters to the loader", async () => {
    const user = userEvent.setup();
    const loadOrders = vi.fn().mockResolvedValue(orderResult);

    render(
      <MemoryRouter initialEntries={["/orders?status=ready"]}>
        <OrdersListPage loadOrders={loadOrders} />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(loadOrders).toHaveBeenLastCalledWith({
        page: 1,
        search: "",
        status: "ready",
        preset: "all",
        canViewFinance: true,
      }),
    );

    await user.type(
      screen.getByPlaceholderText("搜尋訂單編號、客戶或公司"),
      "B-1513",
    );
    await user.click(screen.getByRole("button", { name: "搜尋" }));

    await waitFor(() =>
      expect(loadOrders).toHaveBeenLastCalledWith({
        page: 1,
        search: "B-1513",
        status: "ready",
        preset: "all",
        canViewFinance: true,
      }),
    );
  });

  it("loads the pending preset from unconfirmed orders", async () => {
    const loadOrders = vi.fn().mockResolvedValue(orderResult);

    render(
      <MemoryRouter>
        <OrdersListPage preset="pending" loadOrders={loadOrders} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "待確定訂單" }),
    ).toBeInTheDocument();
    const table = within(screen.getByRole("table"));
    expect(table.getByText("待確定")).toBeInTheDocument();
    expect(table.queryByText("已確認")).not.toBeInTheDocument();
    expect(loadOrders).toHaveBeenCalledWith(
      expect.objectContaining({ preset: "pending" }),
    );
  });

  it("paginates orders in groups of fifteen", async () => {
    const user = userEvent.setup();
    const loadOrders = vi
      .fn()
      .mockResolvedValue({ ...orderResult, total: 31 });

    render(
      <MemoryRouter>
        <OrdersListPage loadOrders={loadOrders} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("spinbutton", { name: "跳至頁碼" }),
    ).toHaveValue(1);
    await user.click(screen.getByRole("button", { name: "下一頁" }));

    await waitFor(() =>
      expect(loadOrders).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );
  });

  it("jumps directly to a selected page", async () => {
    const user = userEvent.setup();
    const loadOrders = vi
      .fn()
      .mockResolvedValue({ ...orderResult, total: 61 });

    render(
      <MemoryRouter>
        <OrdersListPage loadOrders={loadOrders} />
      </MemoryRouter>,
    );

    const jumpInput = await screen.findByRole("spinbutton", {
      name: "跳至頁碼",
    });
    await user.clear(jumpInput);
    await user.type(jumpInput, "4");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(loadOrders).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 4 }),
      ),
    );
  });

  it("keeps pagination visible while the order rows scroll", () => {
    const stylesheet = readFileSync(
      path.resolve(process.cwd(), "src/index.css"),
      "utf8",
    );
    const panelRules = [
      ...stylesheet.matchAll(/\.orders-panel\s*\{([^}]+)\}/g),
    ]
      .map((match) => match[1])
      .join("\n");
    const tableRules = [
      ...stylesheet.matchAll(/\.orders-table-wrap\s*\{([^}]+)\}/g),
    ]
      .map((match) => match[1])
      .join("\n");
    const paginationRules = [
      ...stylesheet.matchAll(
        /\.operational-list-pagination\s*\{([^}]+)\}/g,
      ),
    ]
      .map((match) => match[1])
      .join("\n");

    expect(panelRules).toContain(
      "grid-template-rows: auto minmax(0, 1fr) auto",
    );
    expect(tableRules).toContain("overflow: auto");
    expect(paginationRules).toContain("position: sticky");
    expect(paginationRules).toContain("bottom: 0");
  });

  it("blocks finance presets for roles without finance access", async () => {
    const loadOrders = vi.fn().mockResolvedValue(orderResult);

    render(
      <MemoryRouter>
        <OrdersListPage
          preset="unpaid"
          canViewFinance={false}
          loadOrders={loadOrders}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("此角色無法查看財務訂單視圖"),
    ).toBeInTheDocument();
    expect(loadOrders).not.toHaveBeenCalled();
  });

  it("shows an actionable load error", async () => {
    const loadOrders = vi.fn().mockRejectedValue({ code: "orders_failed" });

    render(
      <MemoryRouter>
        <OrdersListPage loadOrders={loadOrders} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("暫時無法載入訂單")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新載入" })).toBeInTheDocument();
  });
});
