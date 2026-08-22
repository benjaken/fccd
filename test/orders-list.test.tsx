import { readFileSync } from "node:fs";
import path from "node:path";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrdersListPage } from "@/components/OrdersListPage";
import i18n from "@/i18n";
import type { OrderListConfigRow } from "@/lib/order-list-configs";
import type { OrderListResult } from "@/lib/orders";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    profile: { user_name: "Mandy", email: "mandy@example.com" },
  }),
}));

const orderResult: OrderListResult = {
  total: 1,
  items: [
    {
      id: "order-1",
      orderNumber: "B-1513",
      customerName: "陳小姐",
      companyName: "香港女童軍總會",
      email: "customer@example.com",
      deliveryAt: "2026-08-12T00:00:00+08:00",
      factoryDate: "2026-08-11T16:00:00.000Z",
      shipOutTime: "11:30",
      deliveryStatus: "待取貨",
      isSentToFactory: null,
      isAssignedToFleet: false,
      grandTotal: 1610,
      outstanding: 1610,
      currency: "HKD",
      createdAt: "2026-08-12T01:00:00.000Z",
      statuses: [{ name: "待取貨", color: "#16a34a" }],
      statusLegacyIds: [],
      tags: [{ name: "Klook", color: null }],
      shopifyOrderId: 7808193593617,
      shopifyStoreDomain: "hklunchbox.myshopify.com",
      channelName: "Catering",
      districtName: "中環",
      address: "Central",
      factoryPackingNote: "餐具分開包裝，紙盒請貼上標籤",
      contactPhone: "+85291234567",
      quantity: 12,
      manualTodos: [{ id: "todo-1", orderId: "order-1", key: "klook", label: "KLOOK" }],
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
    const tableElement = screen.getByRole("table");
    const table = within(tableElement);
    expect(table.getByText("陳小姐")).toBeInTheDocument();
    expect(table.getByText("+85291234567")).toBeInTheDocument();
    expect(table.getByText("Central")).toBeInTheDocument();
    const configuredStatus = Array.from(tableElement.querySelectorAll(".status-badge"))
      .find((badge) => badge.textContent === "待取貨");
    expect(configuredStatus).toBeInTheDocument();
    expect(configuredStatus).toHaveStyle({
      backgroundColor: "#16a34a",
      borderColor: "#16a34a",
      color: "#ffffff",
    });
    expect(table.getByText("Klook")).toBeInTheDocument();
    expect(table.getByText("2026-08-12")).toBeInTheDocument();
    expect(table.getByText("出車時間：")).toBeInTheDocument();
    expect(table.getByText("送貨時間：")).toBeInTheDocument();
    expect(table.getByText("送貨狀態：")).toBeInTheDocument();
    expect(table.getAllByText("HK$1,610")).toHaveLength(1);
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
      expect(loadOrders).toHaveBeenLastCalledWith(expect.objectContaining({
        page: 1,
        search: "",
        status: "ready",
        preset: "all",
        canViewFinance: true,
      })),
    );

    await user.type(
      screen.getByPlaceholderText("搜尋訂單編號、客戶或公司"),
      "B-1513",
    );
    await user.click(screen.getByRole("button", { name: "搜尋" }));

    await waitFor(() =>
      expect(loadOrders).toHaveBeenLastCalledWith(expect.objectContaining({
        page: 1,
        search: "B-1513",
        status: "ready",
        preset: "all",
        canViewFinance: true,
      })),
    );
  });

  it("renders the shared enhanced columns and keeps to-dos on all only", async () => {
    const user = userEvent.setup();
    const loadOrders = vi.fn().mockResolvedValue(orderResult);
    const { rerender } = render(
      <MemoryRouter><OrdersListPage loadOrders={loadOrders} loadListConfig={emptyListConfig} /></MemoryRouter>,
    );
    const table = await screen.findByRole("table");
    expect(within(table).getByText("品牌")).toBeInTheDocument();
    expect(within(table).getByText("訂單標籤")).toBeInTheDocument();
    expect(within(table).getByText("數量")).toBeInTheDocument();
    expect(within(table).getByText("待辦")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "開啟篩選" }));
    expect(screen.getByRole("combobox", { name: "品牌" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "訂單標籤" })).toBeInTheDocument();
    expect(within(table).getAllByText("KLOOK").length).toBeGreaterThan(0);
    rerender(<MemoryRouter><OrdersListPage preset="pending" loadOrders={loadOrders} loadListConfig={emptyListConfig} /></MemoryRouter>);
    expect((await screen.findAllByRole("table"))[0]).not.toHaveTextContent("待辦");
  });

  it("hides the not-sent factory status when the order is marked not to send", async () => {
    const loadOrders = vi.fn().mockResolvedValue({
      ...orderResult,
      items: [{
        ...orderResult.items[0],
        outstanding: 0,
        factoryPackingNote: null,
        doNotSendToFactory: true,
        statuses: [{ name: "未傳至工場", color: "#f59e0b" }],
        manualTodos: [],
      }],
    });

    render(
      <MemoryRouter>
        <OrdersListPage
          loadOrders={loadOrders}
          loadListConfig={emptyListConfig}
          loadStatusCatalog={vi.fn().mockResolvedValue([])}
        />
      </MemoryRouter>,
    );

    const table = within(await screen.findByRole("table"));
    expect(table.queryByText("未傳至工場")).not.toBeInTheDocument();
    expect(table.queryByText("未傳送到工場")).not.toBeInTheDocument();
  });

  it("opens the existing customer messages side panel from the row chat action", async () => {
    const user = userEvent.setup();
    const loadMessages = vi.fn().mockResolvedValue({
      complaint: [],
      like: [],
      note: [],
    });
    const createNote = vi.fn().mockResolvedValue({
      id: "note-1",
      tab: "note",
      body: "請留意送貨時間",
      authorName: "Mandy",
      replyEmail: null,
      orderNumber: "B-1513",
      orderId: "order-1",
      documentType: "order",
      createdAt: "2026-08-21T12:00:00.000Z",
    });

    render(
      <MemoryRouter>
        <OrdersListPage
          loadOrders={vi.fn().mockResolvedValue(orderResult)}
          loadListConfig={emptyListConfig}
          loadCustomerMessages={loadMessages}
          createCustomerNote={createNote}
        />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "留言 B-1513" }));
    const dialog = screen.getByRole("dialog", { name: "留言" });
    expect(dialog).toHaveClass("side-panel-messages");
    expect(loadMessages).toHaveBeenCalledWith("order-1");
    expect(within(dialog).getByRole("tab", { name: "訂單投訴 (0)" })).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: "訂單讚好 (0)" })).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: "客戶備註 (0)" })).toBeInTheDocument();

    await user.type(within(dialog).getByPlaceholderText("在此輸入…"), "請留意送貨時間");
    await user.click(within(dialog).getByRole("button", { name: "送出留言" }));
    await waitFor(() => expect(createNote).toHaveBeenCalledWith(expect.objectContaining({
      email: "customer@example.com",
      orderId: "order-1",
      body: "請留意送貨時間",
    })));
  });

  it("opens order messages when a phone exists without an email", async () => {
    const user = userEvent.setup();
    const loadMessages = vi.fn().mockResolvedValue({
      complaint: [],
      like: [],
      note: [],
    });
    const phoneOnlyResult: OrderListResult = {
      ...orderResult,
      items: orderResult.items.map((order) => ({ ...order, email: null })),
    };

    render(
      <MemoryRouter>
        <OrdersListPage
          loadOrders={vi.fn().mockResolvedValue(phoneOnlyResult)}
          loadListConfig={emptyListConfig}
          loadCustomerMessages={loadMessages}
        />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "留言 B-1513" }));

    expect(screen.getByRole("dialog", { name: "留言" })).toBeInTheDocument();
    expect(loadMessages).toHaveBeenCalledWith("order-1");
  });

  it("adds multiple order statuses from the All Orders action column", async () => {
    const user = userEvent.setup();
    const loadOrders = vi.fn().mockResolvedValue(orderResult);
    const updateStatuses = vi.fn().mockResolvedValue(undefined);
    const loadStatusCatalog = vi.fn().mockResolvedValue([
      { id: "status-1", legacyId: "legacy-reschedule", name: "改期未定", color: null, sortOrder: 1 },
      { id: "status-2", legacyId: "legacy-wp", name: "WP", color: null, sortOrder: 2 },
      { id: "status-3", legacyId: "legacy-bw", name: "BW", color: null, sortOrder: 3 },
      { id: "status-4", legacyId: "legacy-fp", name: "FP", color: null, sortOrder: 4 },
      { id: "status-5", legacyId: "legacy-klook", name: "KLOOK", color: null, sortOrder: 5 },
      { id: "status-6", legacyId: "legacy-alipay", name: "Alipay", color: null, sortOrder: 6 },
      { id: "status-7", legacyId: "legacy-split", name: "已拆單", color: null, sortOrder: 7 },
      { id: "status-8", legacyId: "legacy-monthly", name: "月結", color: null, sortOrder: 8 },
      { id: "status-9", legacyId: "legacy-hidden", name: "其他狀態", color: null, sortOrder: 9 },
    ]);

    render(
      <MemoryRouter>
        <OrdersListPage
          loadOrders={loadOrders}
          loadListConfig={emptyListConfig}
          loadStatusCatalog={loadStatusCatalog}
          updateStatuses={updateStatuses}
        />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "增加訂單狀態" }));
    const dialog = screen.getByRole("dialog", { name: "增加訂單狀態" });
    await user.click(within(dialog).getByRole("combobox", { name: "訂單狀態" }));
    expect(within(dialog).queryByRole("option", { name: "其他狀態" })).not.toBeInTheDocument();
    const reschedule = await within(dialog).findByRole("option", { name: "改期未定" });
    const split = within(dialog).getByRole("option", { name: "已拆單" });
    const monthly = within(dialog).getByRole("option", { name: "月結" });
    act(() => {
      reschedule.click();
      split.click();
      monthly.click();
    });
    await user.click(within(dialog).getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(updateStatuses).toHaveBeenCalledWith(
      "order-1",
      ["legacy-reschedule", "legacy-split", "legacy-monthly"],
    ));
  });

  it("shows packing-note content on the kitchen-notes queue", async () => {
    const loadOrders = vi.fn().mockResolvedValue(orderResult);

    render(
      <MemoryRouter>
        <OrdersListPage
          preset="kitchen-notes"
          loadOrders={loadOrders}
          loadListConfig={emptyListConfig}
        />
      </MemoryRouter>,
    );

    const table = within(await screen.findByRole("table"));
    expect(table.getByRole("columnheader", { name: "廚房備註" })).toBeInTheDocument();
    expect(table.getByText("餐具分開包裝，紙盒請貼上標籤")).toBeInTheDocument();
  });

  it.each([
    "pending",
    "not-sent-factory",
    "unpaid",
    "monthly-settlement",
    "split",
    "kitchen-notes",
    "reschedule-pending",
  ] as const)("shows only order tags in the %s queue tag column", async (preset) => {
    const loadOrders = vi.fn().mockResolvedValue({
      ...orderResult,
      items: [{
        ...orderResult.items[0],
        tags: [
          { name: "Alipay Voucher", color: null },
          { name: "Klook", color: null },
          { name: "中式套餐", color: null },
        ],
        manualTodos: [
          { id: "todo-1", orderId: "order-1", key: "klook", label: "KLOOK" },
        ],
      }],
    });

    render(
      <MemoryRouter>
        <OrdersListPage
          preset={preset}
          loadOrders={loadOrders}
          loadListConfig={emptyListConfig}
        />
      </MemoryRouter>,
    );

    const table = within(await screen.findByRole("table"));
    expect(table.getByText("Alipay Voucher")).toBeInTheDocument();
    expect(table.getByText("Klook")).toBeInTheDocument();
    expect(table.getByText("中式套餐")).toBeInTheDocument();
    expect(table.queryByText("KLOOK")).not.toBeInTheDocument();
  });

  it("cancels an entire delivery after void confirmation, including delivered orders", async () => {
    const user = userEvent.setup();
    const loadOrders = vi.fn().mockResolvedValue({
      ...orderResult,
      items: [{ ...orderResult.items[0], deliveryStatus: "\u5df2\u9001\u9054" }],
    });
    const cancelDelivery = vi.fn().mockResolvedValue(undefined);
    render(<MemoryRouter><OrdersListPage loadOrders={loadOrders} loadListConfig={emptyListConfig} cancelDelivery={cancelDelivery} /></MemoryRouter>);

    expect(screen.queryByLabelText("Actions for B-1513")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Details" })).not.toBeInTheDocument();
    const editLink = await screen.findByRole("link", { name: "編輯" });
    expect(editLink).toHaveAttribute("href", "/orders/order-1/edit");
    expect(screen.getByRole("button", { name: "增加訂單狀態" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "溝通" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "複製" })).toHaveAttribute("href", "/orders/new?copyFrom=order-1");

    await user.click(screen.getByRole("button", { name: "取消訂單" }));
    const dialog = screen.getByRole("dialog", { name: "取消整筆送貨" });
    const confirm = within(dialog).getByRole("button", { name: "確認取消" });
    expect(confirm).toBeDisabled();
    expect(within(dialog).queryByRole("link", { name: "Open order details" })).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("輸入 void 以確認取消"), "VOID");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(cancelDelivery).toHaveBeenCalledWith("order-1"));
    await waitFor(() => expect(loadOrders).toHaveBeenCalledTimes(2));
  });

  it("opens controlled printable previews without exposing finance when restricted", async () => {
    const user = userEvent.setup();
    const loadOrderJob = vi.fn().mockResolvedValue({
      packingNote: "餐具分開包裝",
      customerNote: "Please call on arrival",
      dispatchTime: "11:30",
      arrivalWindow: "12:00 - 13:00",
      brandName: "HK lunch box",
      brandWebsite: "https://hklunchbox.com/",
      lines: [
        {
          id: "line-1",
          label: "咖喱唐揚雞塊飯",
          quantityText: "12",
          remarks: ["配蕃茄沙律"],
          printed: false,
        },
      ],
    });
    const loadOrders = vi.fn().mockResolvedValue({
      ...orderResult,
      items: [{
        ...orderResult.items[0],
        isSentToFactory: true,
        isAssignedToFleet: true,
        shippingMethodName: "Curbside",
        customerNote: "Please call on arrival",
      }],
    });
    render(<MemoryRouter><OrdersListPage canViewFinance={false} loadOrders={loadOrders} loadListConfig={emptyListConfig} loadOrderJob={loadOrderJob} /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "送貨單" }));
    const dialog = screen.getByRole("dialog", { name: "送貨單預覽" });
    expect(dialog).toHaveClass("side-panel", "order-delivery-note-panel");
    expect(await within(dialog).findByText(/咖喱唐揚雞塊飯/)).toBeInTheDocument();
    expect(within(dialog).getByText(/訂單 B-1513/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Central \* Curbside/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Please call on arrival/)).toBeInTheDocument();
    expect(within(dialog).getByText(/12 份/)).toBeInTheDocument();
    expect(dialog.querySelector(".factory-delivery-note-brand img")).toHaveAttribute(
      "src",
      "/assets/fcc-hk-lunch-box-logo.svg",
    );
    expect(within(dialog).queryByText("Amount:")).not.toBeInTheDocument();
    expect(within(dialog).getByText("此為預覽，列印不會更改訂單。")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "列印" })).toBeInTheDocument();
    expect(within(dialog).queryByText("Delivery note preview")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消訂單" })).toBeInTheDocument();
  });

  it.each([
    {
      label: "neither factory-sent nor fleet-assigned and unpaid",
      isSentToFactory: false,
      isAssignedToFleet: false,
      outstanding: 100,
      deliveryNote: false,
      paidDocuments: false,
    },
    {
      label: "factory-sent but not fleet-assigned and paid",
      isSentToFactory: true,
      isAssignedToFleet: false,
      outstanding: 0,
      deliveryNote: false,
      paidDocuments: true,
    },
    {
      label: "factory-sent and fleet-assigned but unpaid",
      isSentToFactory: true,
      isAssignedToFleet: true,
      outstanding: 100,
      deliveryNote: true,
      paidDocuments: false,
    },
    {
      label: "factory-sent, fleet-assigned, and paid",
      isSentToFactory: true,
      isAssignedToFleet: true,
      outstanding: 0,
      deliveryNote: true,
      paidDocuments: true,
    },
  ])("gates document actions when an order is $label", async ({
    isSentToFactory,
    isAssignedToFleet,
    outstanding,
    deliveryNote,
    paidDocuments,
  }) => {
    const loadOrders = vi.fn().mockResolvedValue({
      ...orderResult,
      items: [{
        ...orderResult.items[0],
        isSentToFactory,
        isAssignedToFleet,
        outstanding,
      }],
    });

    render(
      <MemoryRouter>
        <OrdersListPage loadOrders={loadOrders} loadListConfig={emptyListConfig} />
      </MemoryRouter>,
    );

    await screen.findByText("B-1513");
    const deliveryButton = screen.queryByRole("button", { name: "送貨單" });
    const receiptButton = screen.queryByRole("link", { name: "REC" });
    const invoiceButton = screen.queryByRole("link", { name: "INV" });
    expect(Boolean(deliveryButton)).toBe(deliveryNote);
    expect(Boolean(receiptButton)).toBe(paidDocuments);
    if (paidDocuments) {
      expect(receiptButton).toHaveAttribute("href", "/orders/order-1/receipt");
      expect(receiptButton).toHaveAttribute("target", "_blank");
      expect(invoiceButton).toHaveAttribute("href", "/orders/order-1/invoice");
      expect(invoiceButton).toHaveAttribute("target", "_blank");
    }
    expect(Boolean(invoiceButton)).toBe(paidDocuments);
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
    expect(table.queryByText("待確定")).not.toBeInTheDocument();
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
    expect(screen.queryByRole("columnheader", { name: "Shopify 關聯" })).not.toBeInTheDocument();
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

  it("filters kitchen notes by packing note, tag queues by catalog names, and Shopify new-order flag", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/lib/orders.ts"),
      "utf8",
    );
    expect(source).toContain('query.overlaps("order_status_legacy_ids", legacyIds)');
    expect(source).toContain('.not("factory_packing_note", "is", null)');
    expect(source).toContain('.neq("factory_packing_note", "")');
    expect(source).toContain('.eq("is_shopify_order", true)');
    // The Shopify queue must show only newly synced orders that have not
    // entered the workflow yet, never linked-and-confirmed legacy orders.
    expect(source).toContain('.eq("source_system", "shopify")');
    expect(source).toContain('.is("delivery_status", null)');
    expect(source).toContain(
      '.or("is_sent_to_factory.is.null,is_sent_to_factory.eq.false")',
    );
    expect(source).toContain('.eq("do_not_send_to_factory", false)');
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
