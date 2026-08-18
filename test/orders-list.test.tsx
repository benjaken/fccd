import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrdersListPage } from "@/components/OrdersListPage";
import i18n from "@/i18n";
import type { OrderListConfigRow } from "@/lib/order-list-configs";
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
      factoryDate: "2026-08-11T16:00:00.000Z",
      shipOutTime: "11:30",
      deliveryStatus: "待取貨",
      isSentToFactory: null,
      grandTotal: 1610,
      outstanding: 1610,
      currency: "HKD",
      createdAt: "2026-08-12T01:00:00.000Z",
      statuses: [{ name: "待取貨", color: "#16a34a" }],
      shopifyOrderId: 7808193593617,
      shopifyStoreDomain: "hklunchbox.myshopify.com",
    },
  ],
};

const emptyListConfig = vi.fn().mockResolvedValue([]);

describe("Orders list", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("renders migrated order snapshots and finance fields", async () => {
    const loadOrders = vi.fn().mockResolvedValue(orderResult);

    render(
      <MemoryRouter>
        <OrdersListPage
          loadOrders={loadOrders}
          loadListConfig={emptyListConfig}
          canViewFinance
        />
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
        <OrdersListPage loadOrders={loadOrders} loadListConfig={emptyListConfig} />
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
        <OrdersListPage preset="pending" loadOrders={loadOrders} loadListConfig={emptyListConfig} />
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

  it.each([
    ["unpaid", "未付款訂單"],
    ["monthly-settlement", "月結訂單"],
    ["split", "拆單訂單"],
    ["kitchen-notes", "廚房備註訂單"],
    ["reschedule-pending", "改期未審訂單"],
    ["shopify-pending", "Shopify待審訂單"],
    ["not-sent-factory", "未傳工場訂單"],
  ] as const)("loads the %s queue with its title", async (preset, title) => {
    const loadOrders = vi.fn().mockResolvedValue(orderResult);

    render(
      <MemoryRouter>
        <OrdersListPage preset={preset} loadOrders={loadOrders} loadListConfig={emptyListConfig} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(loadOrders).toHaveBeenCalledWith(
      expect.objectContaining({ preset }),
    );
  });

  it("shows the configured explanation under the list title", async () => {
    const loadOrders = vi.fn().mockResolvedValue(orderResult);
    const loadListConfig = vi.fn().mockResolvedValue([
      {
        id: "cfg-unpaid",
        presetKey: "unpaid",
        title: "未付款",
        description: "尚有未收金額的訂單，以未付餘額為準。",
        sortOrder: 30,
        isVisible: true,
        route: "/orders/unpaid",
      } satisfies OrderListConfigRow,
    ]);

    render(
      <MemoryRouter>
        <OrdersListPage
          preset="unpaid"
          loadOrders={loadOrders}
          loadListConfig={loadListConfig}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "未付款" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("尚有未收金額的訂單，以未付餘額為準。"),
    ).toBeInTheDocument();
  });

  it("links Shopify orders to their admin page", async () => {
    const loadOrders = vi.fn().mockResolvedValue({
      ...orderResult,
      items: [
        {
          ...orderResult.items[0],
          shopifyOrderId: 7808193593617,
          shopifyStoreDomain: "hklunchbox.myshopify.com",
        },
      ],
    });

    render(
      <MemoryRouter>
        <OrdersListPage loadOrders={loadOrders} loadListConfig={emptyListConfig} />
      </MemoryRouter>,
    );

    const link = await screen.findByRole("link", {
      name: "在 Shopify 開啟訂單 B-1513",
    });
    expect(link).toHaveAttribute(
      "href",
      "https://admin.shopify.com/store/hklunchbox/orders/7808193593617",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows no Shopify link for orders without Shopify data", async () => {
    const loadOrders = vi.fn().mockResolvedValue({
      ...orderResult,
      items: [
        {
          ...orderResult.items[0],
          shopifyOrderId: null,
          shopifyStoreDomain: null,
        },
      ],
    });

    render(
      <MemoryRouter>
        <OrdersListPage loadOrders={loadOrders} loadListConfig={emptyListConfig} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("B-1513")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /在 Shopify 開啟訂單/ }),
    ).not.toBeInTheDocument();
  });

  it("paginates orders in groups of fifteen", async () => {
    const user = userEvent.setup();
    const loadOrders = vi
      .fn()
      .mockResolvedValue({ ...orderResult, total: 31 });

    render(
      <MemoryRouter>
        <OrdersListPage loadOrders={loadOrders} loadListConfig={emptyListConfig} />
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
        <OrdersListPage loadOrders={loadOrders} loadListConfig={emptyListConfig} />
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

  it("keeps the pagination summary and controls on one mobile row", () => {
    const stylesheet = readFileSync(
      path.resolve(process.cwd(), "src/index.css"),
      "utf8",
    );
    const paginationRules = [
      ...stylesheet.matchAll(
        /\.operational-list-pagination\s*\{([^}]+)\}/g,
      ),
    ].map((match) => match[1]);

    const mobilePaginationRule = paginationRules.find(
      (rule) =>
        rule.includes("flex-wrap: nowrap") &&
        rule.includes("flex-direction: row"),
    );

    expect(mobilePaginationRule).toBeTruthy();
    expect(mobilePaginationRule).toContain("flex-direction: row");
    expect(mobilePaginationRule).toContain("flex-wrap: nowrap");
    expect(mobilePaginationRule).not.toContain("flex-direction: column");
    expect(stylesheet).toMatch(
      /\.operational-list-pagination > span\s*\{[^}]*white-space:\s*nowrap/s,
    );
  });

  it("blocks finance presets for roles without finance access", async () => {
    const loadOrders = vi.fn().mockResolvedValue(orderResult);

    render(
      <MemoryRouter>
        <OrdersListPage
          preset="unpaid"
          canViewFinance={false}
          loadOrders={loadOrders} loadListConfig={emptyListConfig}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("此角色無法查看財務訂單視圖"),
    ).toBeInTheDocument();
    expect(loadOrders).not.toHaveBeenCalled();
  });

  it("filters leftover-tag queues by catalog names and Shopify new-order flag", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/lib/orders.ts"),
      "utf8",
    );
    expect(source).toContain('query.overlaps("order_status_legacy_ids", legacyIds)');
    expect(source).toContain('.eq("is_shopify_order", true)');
    // The Shopify queue must show only newly synced orders that have not
    // entered the workflow yet, never linked-and-confirmed legacy orders.
    expect(source).toContain('.eq("source_system", "shopify")');
    expect(source).toContain('.is("delivery_status", null)');
    expect(source).toContain(
      '.or("is_sent_to_factory.is.null,is_sent_to_factory.eq.false")',
    );
    expect(source).toContain('query.gt("outstanding", 0)');
  });

  it("shows an actionable load error", async () => {
    const loadOrders = vi.fn().mockRejectedValue({ code: "orders_failed" });

    render(
      <MemoryRouter>
        <OrdersListPage loadOrders={loadOrders} loadListConfig={emptyListConfig} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("暫時無法載入訂單")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新載入" })).toBeInTheDocument();
  });

  it("syncs Shopify orders from the pending queue after confirmation", async () => {
    const user = userEvent.setup();
    const loadOrders = vi.fn().mockResolvedValue(orderResult);
    const syncShopify = vi.fn().mockResolvedValue({
      ok: true,
      dryRun: false,
      backfill: false,
      storeCount: 1,
      fetched: 2,
      inserted: 1,
      linkedExisting: 1,
      updatedShopify: 0,
      unmatchedSkuLines: 0,
      paymentsInserted: 0,
      paymentsPending: 0,
      issueCount: 0,
      stores: [],
    });

    render(
      <MemoryRouter>
        <OrdersListPage
          preset="shopify-pending"
          loadOrders={loadOrders}
          loadListConfig={emptyListConfig}
          syncShopify={syncShopify}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("button", { name: "同步 Shopify" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "同步 Shopify" }));

    expect(
      await screen.findByRole("alertdialog", { name: "同步 Shopify 訂單" }),
    ).toBeInTheDocument();
    expect(syncShopify).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "確認同步" }));
    await waitFor(() => expect(syncShopify).toHaveBeenCalledTimes(1));

    expect(
      await screen.findByRole("alertdialog", { name: "同步完成" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/已取得 2 筆訂單：新增 1 筆、更新 0 筆、連結 1 筆/),
    ).toBeInTheDocument();
  });

  it("confirms before syncing and can cancel", async () => {
    const user = userEvent.setup();
    const loadOrders = vi.fn().mockResolvedValue(orderResult);
    const syncShopify = vi.fn().mockResolvedValue({
      ok: true,
      dryRun: false,
      backfill: false,
      storeCount: 1,
      fetched: 1,
      inserted: 1,
      linkedExisting: 0,
      updatedShopify: 0,
      unmatchedSkuLines: 0,
      paymentsInserted: 0,
      paymentsPending: 0,
      issueCount: 0,
      stores: [],
    });

    render(
      <MemoryRouter>
        <OrdersListPage
          preset="shopify-pending"
          loadOrders={loadOrders}
          loadListConfig={emptyListConfig}
          syncShopify={syncShopify}
        />
      </MemoryRouter>,
    );

    await user.click(
      await screen.findByRole("button", { name: "同步 Shopify" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "同步 Shopify 訂單",
    });

    const cancelButtons = within(dialog).getAllByRole("button", {
      name: "取消",
    });
    await user.click(cancelButtons[cancelButtons.length - 1]!);
    expect(syncShopify).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("alertdialog", { name: "同步 Shopify 訂單" }),
    ).not.toBeInTheDocument();
  });

  it("shows the sync error and offers a retry", async () => {
    const user = userEvent.setup();
    const loadOrders = vi.fn().mockResolvedValue(orderResult);
    const syncShopify = vi.fn().mockRejectedValue(new Error("shopify_sync_failed"));

    render(
      <MemoryRouter>
        <OrdersListPage
          preset="shopify-pending"
          loadOrders={loadOrders}
          loadListConfig={emptyListConfig}
          syncShopify={syncShopify}
        />
      </MemoryRouter>,
    );

    await user.click(
      await screen.findByRole("button", { name: "同步 Shopify" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "確認同步" }),
    );

    expect(
      await screen.findByRole("alertdialog", { name: "同步失敗" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重試同步" })).toBeInTheDocument();
    expect(syncShopify).toHaveBeenCalledTimes(1);
  });
});
