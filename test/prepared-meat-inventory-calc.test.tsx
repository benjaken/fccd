import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PreparedMeatInventoryCalcPage } from "@/components/PreparedMeatInventoryCalcPage";
import i18n from "@/i18n";
import {
  currentHongKongYear,
  type PreparedMeatItemOption,
  type PreparedMeatMovementRow,
} from "@/lib/prepared-meat-inventory";

const plentyOfStock = {
  prepared: { "item-1": 100, "item-2": 100 },
  raw: { "raw-1": 100 },
};

const currentYear = currentHongKongYear();

const items: PreparedMeatItemOption[] = [
  {
    id: "item-1",
    sku: "PM001",
    name: "五香牛腩",
    unit: "包",
    sortOrder: 1,
    isActive: true,
  },
  {
    id: "item-2",
    sku: "PM002",
    name: "滷水豬手",
    unit: "包",
    sortOrder: 2,
    isActive: true,
  },
];

const movementsByItem: Record<string, PreparedMeatMovementRow[]> = {
  "item-1": [
    {
      id: "move-out-june",
      movementAt: "2026-06-15T04:00:00.000Z",
      productName: "五香牛腩",
      shopId: "shop-ylp",
      shopName: "桂花小幸 YLP",
      inboundPackages: null,
      outboundPackages: 2,
      balancePackages: 8,
      remarks: "june out",
      kind: "outbound",
      meatOrderId: "order-june-out",
    },
    {
      id: "move-in-june",
      movementAt: "2026-06-10T04:00:00.000Z",
      productName: "五香牛腩",
      shopId: null,
      shopName: null,
      inboundPackages: 4,
      outboundPackages: null,
      balancePackages: 10,
      remarks: "june in",
      kind: "inbound",
      meatOrderId: null,
    },
    {
      id: "move-out-may",
      movementAt: "2026-05-20T04:00:00.000Z",
      productName: "五香牛腩",
      shopId: "shop-tst",
      shopName: "尖沙咀店",
      inboundPackages: null,
      outboundPackages: 1,
      balancePackages: 6,
      remarks: "may out",
      kind: "outbound",
      meatOrderId: "order-may-out",
    },
  ],
  "item-2": [
    {
      id: "move-2",
      movementAt: "2026-06-01T04:00:00.000Z",
      productName: "滷水豬手",
      shopId: "shop-ylp",
      shopName: "桂花小幸 YLP",
      inboundPackages: null,
      outboundPackages: 3,
      balancePackages: 12,
      remarks: null,
      kind: "outbound",
      meatOrderId: "order-item-2",
    },
  ],
};

describe("Prepared meat inventory calculation page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("shows left item tabs and defaults to the first item ledger", async () => {
    const loadItems = vi.fn().mockResolvedValue(items);
    const loadMovements = vi
      .fn()
      .mockImplementation(async (itemId: string, productName: string) => {
        expect(productName).toBeTruthy();
        return movementsByItem[itemId] ?? [];
      });

    render(
      <MemoryRouter>
        <PreparedMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "製成品存貨計算" }),
    ).toBeInTheDocument();
    expect(screen.getByText("凍貨")).toHaveClass("eyebrow");

    const sidebar = screen.getByRole("complementary", { name: "製成品選項" });
    expect(within(sidebar).getByRole("button", { name: "五香牛腩" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(within(sidebar).getByRole("button", { name: "滷水豬手" })).toBeInTheDocument();

    await waitFor(() => {
      expect(loadMovements).toHaveBeenCalledWith(
        "item-1",
        "五香牛腩",
        currentYear,
      );
    });

    expect(await screen.findByText("桂花小幸 YLP")).toBeInTheDocument();
    expect(screen.getByText("尖沙咀店")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "年份" })).toHaveValue(
      String(currentYear),
    );
  });

  it("switches the right-side ledger when selecting another item", async () => {
    const user = userEvent.setup();
    const loadItems = vi.fn().mockResolvedValue(items);
    const loadMovements = vi
      .fn()
      .mockImplementation(async (itemId: string) => movementsByItem[itemId] ?? []);

    render(
      <MemoryRouter>
        <PreparedMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
        />
      </MemoryRouter>,
    );

    await screen.findByText("桂花小幸 YLP");
    await user.click(screen.getByRole("button", { name: "滷水豬手" }));

    await waitFor(() => {
      expect(loadMovements).toHaveBeenCalledWith(
        "item-2",
        "滷水豬手",
        currentYear,
      );
    });

    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "滷水豬手" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.queryByText("尖沙咀店")).not.toBeInTheDocument();
  });

  it("filters the ledger by month and shop", async () => {
    const user = userEvent.setup();
    const loadItems = vi.fn().mockResolvedValue(items);
    const loadMovements = vi
      .fn()
      .mockImplementation(async (itemId: string) =>
        structuredClone(movementsByItem[itemId] ?? []),
      );

    render(
      <MemoryRouter>
        <PreparedMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("june out")).toBeInTheDocument();
    expect(screen.getByText("may out")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "篩選月份" }));
    const monthBox = await screen.findByRole("listbox", { name: "篩選月份" });
    expect(within(monthBox).getByRole("option", { name: "全部月份" })).toBeInTheDocument();
    await user.click(within(monthBox).getByRole("option", { name: "Jun-26" }));

    expect(await screen.findByText("june out")).toBeInTheDocument();
    expect(screen.getByText("june in")).toBeInTheDocument();
    expect(screen.queryByText("may out")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "篩選月份" })).toHaveTextContent(
      "Jun-26",
    );

    await user.click(screen.getByRole("button", { name: "篩選店鋪" }));
    const shopBox = await screen.findByRole("listbox", { name: "篩選店鋪" });
    expect(within(shopBox).getByRole("option", { name: "全部店鋪" })).toBeInTheDocument();
    await user.click(within(shopBox).getByRole("option", { name: "桂花小幸 YLP" }));

    expect(await screen.findByText("june out")).toBeInTheDocument();
    expect(screen.queryByText("june in")).not.toBeInTheDocument();
    expect(screen.queryByText("may out")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "篩選店鋪" })).toHaveTextContent(
      "桂花小幸 YLP",
    );
  });

  it("uses the same pencil edit icon for inbound and outbound, targeting different forms", async () => {
    const loadItems = vi.fn().mockResolvedValue(items);
    const loadMovements = vi
      .fn()
      .mockImplementation(async (itemId: string) => movementsByItem[itemId] ?? []);

    render(
      <MemoryRouter>
        <PreparedMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
        />
      </MemoryRouter>,
    );

    const inboundEdit = await screen.findByRole("button", { name: "入貨編輯" });
    const outboundEdits = screen.getAllByRole("button", { name: "出貨編輯" });

    expect(inboundEdit).toHaveAttribute("data-edit-form", "inbound");
    expect(inboundEdit.textContent).toBe("");
    expect(outboundEdits.length).toBeGreaterThan(0);
    expect(outboundEdits[0]).toHaveAttribute("data-edit-form", "outbound");
    expect(outboundEdits[0]?.textContent).toBe("");
    expect(inboundEdit.querySelector("svg")?.innerHTML).toBe(
      outboundEdits[0]?.querySelector("svg")?.innerHTML,
    );
  });

  it("opens the prepared meat options side panel from the sidebar header icon", async () => {
    const user = userEvent.setup();
    const loadItems = vi.fn().mockResolvedValue([
      ...items,
      {
        id: "item-3",
        sku: "PM003",
        name: "秘製沙茶醬 (500g)",
        unit: "樽",
        sortOrder: 12,
        isActive: false,
      },
    ]);
    const loadMovements = vi
      .fn()
      .mockImplementation(async (itemId: string) =>
        structuredClone(movementsByItem[itemId] ?? []),
      );
    const saveItemFlags = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <PreparedMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
          saveItemFlags={saveItemFlags}
        />
      </MemoryRouter>,
    );

    const sidebar = await screen.findByRole("complementary", {
      name: "製成品選項",
    });
    expect(within(sidebar).queryByRole("button", { name: "秘製沙茶醬 (500g)" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "管理製成品選項" }));

    const dialog = await screen.findByRole("dialog", { name: "製成品選項" });
    expect(dialog).toHaveClass("side-panel");
    expect(dialog.querySelector(".raw-meat-options-table-wrap")).not.toBeNull();
    expect(dialog.querySelector(".prepared-meat-options-table")).not.toBeNull();
    expect(within(dialog).getByText("排序")).toBeInTheDocument();
    expect(within(dialog).getByText("製成品")).toBeInTheDocument();
    expect(within(dialog).getByText("有效")).toBeInTheDocument();
    expect(within(dialog).queryByText("可直接出貨")).not.toBeInTheDocument();
    expect(within(dialog).getByText("五香牛腩")).toBeInTheDocument();
    expect(within(dialog).getByText("秘製沙茶醬 (500g)")).toBeInTheDocument();
    expect(within(dialog).getByText("12")).toBeInTheDocument();

    const activeSwitch = within(dialog).getByRole("switch", {
      name: "五香牛腩 有效",
    });
    expect(activeSwitch).toHaveAttribute("aria-checked", "true");
    expect(
      within(dialog).getByRole("switch", { name: "秘製沙茶醬 (500g) 有效" }),
    ).toHaveAttribute("aria-checked", "false");

    await user.click(activeSwitch);

    await waitFor(() => {
      expect(saveItemFlags).toHaveBeenCalledWith("item-1", false);
    });

    expect(
      within(sidebar).queryByRole("button", { name: "五香牛腩" }),
    ).not.toBeInTheDocument();
    expect(within(sidebar).getByRole("button", { name: "滷水豬手" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("opens an add-option side panel and keeps kg/pack numeric", async () => {
    const user = userEvent.setup();
    const loadItems = vi.fn().mockResolvedValue(items);
    const loadMovements = vi.fn().mockResolvedValue([]);
    const loadRawMeatChoices = vi.fn().mockResolvedValue([
      { id: "raw-pork", name: "豬肉粒" },
      { id: "raw-tripe", name: "豬肚" },
    ]);
    const createItem = vi.fn().mockResolvedValue({
      id: "item-new",
      sku: "FCR099",
      name: "測試製成品",
      unit: "包",
      sortOrder: 99,
      isActive: true,
    });

    render(
      <MemoryRouter>
        <PreparedMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
          loadRawMeatChoices={loadRawMeatChoices}
          createItem={createItem}
        />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "新增製成品選項" }));
    const dialog = await screen.findByRole("dialog", { name: "添加選項" });
    expect(dialog).toHaveClass("side-panel");
    expect(within(dialog).queryByRole("button", { name: "編輯" })).toBeNull();

    await user.type(
      within(dialog).getByRole("textbox", { name: "產品名稱", exact: true }),
      "測試製成品",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "產品名稱 (英)" }),
      "Test prepared",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "產品編號" }),
      "FCR099",
    );
    await user.type(within(dialog).getByRole("textbox", { name: "單位" }), "包");

    const kg = within(dialog).getByRole("textbox", { name: "kg/包" });
    await user.type(kg, "勝多負少");
    expect(kg).toHaveValue("");
    await user.type(kg, "2");
    expect(kg).toHaveValue("2");

    await user.click(within(dialog).getByRole("textbox", { name: "生肉" }));
    await user.click(within(dialog).getByRole("option", { name: "豬肉粒" }));
    await user.click(within(dialog).getByRole("button", { name: "提交" }));

    await waitFor(() => {
      expect(createItem).toHaveBeenCalledWith({
        name: "測試製成品",
        englishName: "Test prepared",
        sku: "FCR099",
        unit: "包",
        kgPerPackage: 2,
        rawMeatItemIds: ["raw-pork"],
      });
    });
    expect(await screen.findByRole("button", { name: "測試製成品" })).toBeInTheDocument();
  });

  it("shows five heading actions and opens a delivery-note side panel for outbound", async () => {
    const user = userEvent.setup();
    const loadItems = vi.fn().mockResolvedValue(items);
    const loadMovements = vi.fn().mockResolvedValue([]);
    const loadCustomers = vi.fn().mockResolvedValue([
      {
        id: "cust-ylp",
        customerCode: "C0085",
        name: "桂花小幸 YLP",
        contactPerson: "阿國 / 懷哥",
        phone: "9899 1980",
        address: "元朗廣場",
        deliveryNoteRequired: true,
      },
      {
        id: "cust-room",
        customerCode: "Room R",
        name: "Room R - 到會",
        contactPerson: null,
        phone: null,
        address: null,
        deliveryNoteRequired: false,
      },
    ]);
    const loadShippingMethods = vi.fn().mockResolvedValue([
      { id: "ship-1", name: "三皇物流" },
    ]);
    const loadOrderNumber = vi.fn().mockResolvedValue("R - 202608 - 8");
    const loadRawItems = vi.fn().mockResolvedValue([]);
    const createOutbound = vi.fn().mockResolvedValue("order-1");
    const sendToFactory = vi.fn().mockResolvedValue("order-1");

    render(
      <MemoryRouter>
        <PreparedMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
          loadCustomers={loadCustomers}
          loadShippingMethods={loadShippingMethods}
          loadOrderNumber={loadOrderNumber}
          loadRawItems={loadRawItems}
          loadStock={async () => plentyOfStock}
          createOutbound={createOutbound}
          sendToFactory={sendToFactory}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "新增製成品選項" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "製成品入貨(扣原料)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "製成品入貨(無原料)" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "管理送貨單" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "製成品出貨" }));

    const dialog = await screen.findByRole("dialog", { name: "送貨單" });
    expect(dialog).toHaveClass("side-panel-xl");
    await waitFor(() => {
      expect(within(dialog).getByRole("combobox", { name: "客戶" })).toBeEnabled();
    });
    expect(within(dialog).queryByRole("button", { name: "編輯" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "送到工場" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "確定" })).toBeDisabled();
    expect(within(dialog).getByRole("textbox", { name: "備註" }).tagName).toBe(
      "TEXTAREA",
    );
    expect(within(dialog).getByRole("textbox", { name: "地址" }).tagName).toBe(
      "TEXTAREA",
    );
    expect(within(dialog).getByRole("textbox", { name: "備註" })).toHaveAttribute(
      "rows",
      "3",
    );
    expect(within(dialog).getByRole("textbox", { name: "地址" })).toHaveAttribute(
      "rows",
      "3",
    );
    expect(
      within(dialog).getByRole("textbox", { name: "備註" }).closest("label"),
    ).toHaveClass("prepared-meat-outbound-remarks");
    expect(
      within(dialog).getByRole("textbox", { name: "地址" }).closest("label"),
    ).toHaveClass("prepared-meat-outbound-address");
    expect(within(dialog).getByRole("textbox", { name: "聯絡人" })).toBeEnabled();
    expect(within(dialog).getByRole("textbox", { name: "文件編號" })).toBeEnabled();

    const shipping = within(dialog).getByRole("combobox", { name: "送貨方式" });
    expect(shipping).toBeDisabled();

    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "客戶" }),
      "cust-ylp",
    );
    expect(shipping).toBeEnabled();
    expect(within(dialog).queryByRole("combobox", { name: "生肉" })).toBeNull();
    await user.selectOptions(shipping, "ship-1");
    expect(shipping).toHaveValue("ship-1");

    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "客戶" }),
      "cust-room",
    );
    expect(shipping).toBeDisabled();
    expect(shipping).toHaveValue("");

    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "客戶" }),
      "cust-ylp",
    );
    expect(shipping).toBeEnabled();
    await user.selectOptions(shipping, "ship-1");

    await user.click(within(dialog).getByRole("combobox", { name: "製成品" }));
    await user.click(within(dialog).getByRole("option", { name: "五香牛腩" }));
    const quantity = within(dialog).getByRole("textbox", { name: "製成品數量" });
    await user.type(quantity, "勝多負少");
    expect(quantity).toHaveValue("");
    await user.type(quantity, "2");
    expect(quantity).toHaveValue("2");
    await user.click(within(dialog).getByRole("button", { name: "加入" }));

    const lines = dialog.querySelector(".prepared-meat-outbound-lines");
    expect(lines).not.toBeNull();
    expect(within(lines as HTMLElement).getByText("五香牛腩")).toBeInTheDocument();
    expect(
      within(lines as HTMLElement).getByRole("textbox", { name: "五香牛腩 數量" }),
    ).toHaveValue("2");

    await user.click(within(dialog).getByRole("button", { name: "確定" }));
    await waitFor(() => {
      expect(createOutbound).toHaveBeenCalledWith({
        customerId: "cust-ylp",
        shippingMethodId: "ship-1",
        orderNumber: "R - 202608 - 8",
        shippingDate: expect.any(String),
        remarks: "",
        contactPerson: "阿國 / 懷哥",
        phone: "9899 1980",
        address: "元朗廣場",
        lines: [
          {
            preparedMeatItemId: "item-1",
            rawMeatItemId: null,
            quantity: 2,
            remarks: "",
          },
        ],
      });
    });
    expect(sendToFactory).not.toHaveBeenCalled();
    expect(within(dialog).queryByRole("button", { name: "確定" })).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "送到工場" }));
    await waitFor(() => {
      expect(sendToFactory).toHaveBeenCalledWith("order-1");
    });
  });

  it("opens an extra-wide inbound panel without raw sources and saves lines", async () => {
    const user = userEvent.setup();
    const loadItems = vi.fn().mockResolvedValue(items);
    const loadMovements = vi.fn().mockResolvedValue([]);
    const createInbound = vi.fn().mockResolvedValue("move-1");

    render(
      <MemoryRouter>
        <PreparedMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
          createInbound={createInbound}
        />
      </MemoryRouter>,
    );

    await user.click(
      await screen.findByRole("button", { name: "製成品入貨(無原料)" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "製成品入貨(無原料)",
    });
    expect(dialog).toHaveClass("side-panel-xl");
    expect(within(dialog).getByLabelText("入貨日期")).toBeEnabled();
    expect(within(dialog).queryByRole("combobox", { name: "客戶" })).toBeNull();
    expect(within(dialog).queryByRole("combobox", { name: "生肉" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "確定" })).toBeDisabled();

    await user.click(within(dialog).getByRole("combobox", { name: "製成品" }));
    await user.click(within(dialog).getByRole("option", { name: "五香牛腩" }));
    const quantity = within(dialog).getByRole("textbox", { name: "製成品數量" });
    await user.type(quantity, "勝多負少");
    expect(quantity).toHaveValue("");
    await user.type(quantity, "3");
    expect(quantity).toHaveValue("3");
    await user.type(
      within(dialog).getByRole("textbox", { name: "製成品備註" }),
      "工場入貨",
    );
    await user.click(within(dialog).getByRole("button", { name: "加入" }));

    const lines = dialog.querySelector(".prepared-meat-outbound-lines");
    expect(lines).not.toBeNull();
    expect(within(lines as HTMLElement).getByText("五香牛腩")).toBeInTheDocument();
    expect(
      within(lines as HTMLElement).getByRole("textbox", { name: "五香牛腩 數量" }),
    ).toHaveValue("3");

    await user.click(within(dialog).getByRole("button", { name: "確定" }));
    await waitFor(() => {
      expect(createInbound).toHaveBeenCalledWith({
        movementDate: expect.any(String),
        lines: [
          {
            preparedMeatItemId: "item-1",
            quantity: 3,
            remarks: "工場入貨",
          },
        ],
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "製成品入貨(無原料)" })).toBeNull();
    });
    expect(loadMovements).toHaveBeenCalledTimes(2);
  });

  it("lets 到會 and 凍肉製作 add direct-ship raw meat", async () => {
    const user = userEvent.setup();
    const loadItems = vi.fn().mockResolvedValue(items);
    const loadMovements = vi.fn().mockResolvedValue([]);
    const loadCustomers = vi.fn().mockResolvedValue([
      {
        id: "cust-ylp",
        customerCode: "C0085",
        name: "桂花小幸 YLP",
        contactPerson: null,
        phone: null,
        address: null,
        deliveryNoteRequired: true,
      },
      {
        id: "cust-room",
        customerCode: "Room R",
        name: "Room R - 到會",
        contactPerson: null,
        phone: null,
        address: null,
        deliveryNoteRequired: false,
      },
      {
        id: "cust-factory",
        customerCode: "Room R 2",
        name: "Room R - 凍肉製作",
        contactPerson: null,
        phone: null,
        address: null,
        deliveryNoteRequired: false,
      },
    ]);
    const loadShippingMethods = vi.fn().mockResolvedValue([
      { id: "ship-1", name: "三皇物流" },
    ]);
    const loadOrderNumber = vi.fn().mockResolvedValue("R - 202608 - 9");
    const loadRawItems = vi.fn().mockResolvedValue([
      {
        id: "raw-1",
        sku: "LKJ015",
        name: "乾冬菇 (廣信)",
        unit: "kg",
      },
    ]);
    const createOutbound = vi.fn().mockResolvedValue("order-2");
    const sendToFactory = vi.fn().mockResolvedValue("order-2");

    render(
      <MemoryRouter>
        <PreparedMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
          loadCustomers={loadCustomers}
          loadShippingMethods={loadShippingMethods}
          loadOrderNumber={loadOrderNumber}
          loadRawItems={loadRawItems}
          loadStock={async () => plentyOfStock}
          createOutbound={createOutbound}
          sendToFactory={sendToFactory}
        />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "製成品出貨" }));
    const dialog = await screen.findByRole("dialog", { name: "送貨單" });
    await waitFor(() => {
      expect(within(dialog).getByRole("combobox", { name: "客戶" })).toBeEnabled();
    });

    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "客戶" }),
      "cust-room",
    );
    expect(within(dialog).getByRole("combobox", { name: "生肉" })).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "送貨方式" })).toBeDisabled();

    await user.click(within(dialog).getByRole("combobox", { name: "生肉" }));
    await user.click(within(dialog).getByRole("option", { name: "乾冬菇 (廣信)" }));
    await user.type(within(dialog).getByRole("textbox", { name: "生肉數量" }), "3");
    await user.click(within(dialog).getAllByRole("button", { name: "加入" })[0]!);

    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "客戶" }),
      "cust-factory",
    );
    expect(within(dialog).getByRole("combobox", { name: "生肉" })).toBeInTheDocument();
    expect(within(dialog).getByText("乾冬菇 (廣信)")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "確定" }));
    await waitFor(() => {
      expect(createOutbound).toHaveBeenCalledWith({
        customerId: "cust-factory",
        shippingMethodId: null,
        orderNumber: "R - 202608 - 9",
        shippingDate: expect.any(String),
        remarks: "",
        contactPerson: "",
        phone: "",
        address: "",
        lines: [
          {
            preparedMeatItemId: null,
            rawMeatItemId: "raw-1",
            quantity: 3,
            remarks: "",
          },
        ],
      });
    });
    expect(within(dialog).getByRole("button", { name: "送到工場" })).toBeInTheDocument();
  });

  it("opens the matching delivery note from outbound edit and keeps every field editable", async () => {
    const user = userEvent.setup();
    const loadItems = vi.fn().mockResolvedValue(items);
    const loadMovements = vi
      .fn()
      .mockImplementation(async (itemId: string) => movementsByItem[itemId] ?? []);
    const loadCustomers = vi.fn().mockResolvedValue([
      {
        id: "cust-ylp",
        customerCode: "C0085",
        name: "桂花小幸 YLP",
        contactPerson: "阿國 / 懷哥",
        phone: "9899 1980",
        address: "元朗廣場",
        deliveryNoteRequired: true,
      },
    ]);
    const loadShippingMethods = vi.fn().mockResolvedValue([
      { id: "ship-1", name: "送貨" },
    ]);
    const loadOrderNumber = vi.fn().mockResolvedValue("R - 202608 - 99");
    const loadRawItems = vi.fn().mockResolvedValue([]);
    const loadOutbound = vi.fn().mockResolvedValue({
      id: "order-june-out",
      customerId: "cust-ylp",
      shippingMethodId: "ship-1",
      orderNumber: "F260728-0002",
      shippingAt: "2026-07-28T00:00:00+08:00",
      remarks: "2:30pm",
      sendToFactory: false,
      contactPerson: "陳小姐",
      phone: "98401200",
      address: "Room 2418",
      lines: [
        {
          kind: "prepared",
          itemId: "item-1",
          sku: "PM001",
          name: "五香牛腩",
          unit: "包",
          quantity: 2,
          remarks: "june out",
        },
      ],
    });
    const updateOutbound = vi.fn().mockResolvedValue("order-june-out");
    const sendToFactory = vi.fn().mockResolvedValue("order-june-out");

    render(
      <MemoryRouter>
        <PreparedMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
          loadCustomers={loadCustomers}
          loadShippingMethods={loadShippingMethods}
          loadOrderNumber={loadOrderNumber}
          loadRawItems={loadRawItems}
          loadStock={async () => plentyOfStock}
          loadOutbound={loadOutbound}
          updateOutbound={updateOutbound}
          sendToFactory={sendToFactory}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("桂花小幸 YLP")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "出貨編輯" })[0]!);

    const dialog = await screen.findByRole("dialog", { name: "送貨單" });
    await waitFor(() => {
      expect(loadOutbound).toHaveBeenCalledWith("order-june-out");
    });
    expect(loadOrderNumber).not.toHaveBeenCalled();

    expect(within(dialog).getByRole("combobox", { name: "客戶" })).toHaveValue(
      "cust-ylp",
    );
    expect(within(dialog).getByRole("textbox", { name: "文件編號" })).toHaveValue(
      "F260728-0002",
    );
    expect(within(dialog).getByRole("textbox", { name: "聯絡人" })).toHaveValue(
      "陳小姐",
    );
    expect(within(dialog).getByRole("textbox", { name: "電話" })).toHaveValue(
      "98401200",
    );
    expect(within(dialog).getByRole("textbox", { name: "地址" })).toHaveValue(
      "Room 2418",
    );
    expect(within(dialog).getByRole("textbox", { name: /^備註$/ })).toHaveValue(
      "2:30pm",
    );
    expect(within(dialog).getByRole("textbox", { name: /^備註$/ }).tagName).toBe(
      "TEXTAREA",
    );
    expect(within(dialog).getByRole("combobox", { name: "送貨方式" })).toHaveValue(
      "ship-1",
    );
    expect(within(dialog).getByRole("textbox", { name: "聯絡人" })).toBeEnabled();
    expect(within(dialog).getByRole("textbox", { name: "地址" })).toBeEnabled();
    expect(within(dialog).getByRole("textbox", { name: "五香牛腩 數量" })).toHaveValue(
      "2",
    );
    expect(within(dialog).getByRole("button", { name: "確定" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "送到工場" })).toBeEnabled();

    const remarks = within(dialog).getByRole("textbox", { name: /^備註$/ });
    await user.clear(remarks);
    await user.type(remarks, "3:00pm");
    await user.clear(within(dialog).getByRole("textbox", { name: "聯絡人" }));
    await user.type(within(dialog).getByRole("textbox", { name: "聯絡人" }), "陳生");
    await user.clear(within(dialog).getByRole("textbox", { name: "五香牛腩 數量" }));
    await user.type(within(dialog).getByRole("textbox", { name: "五香牛腩 數量" }), "5");

    await user.click(within(dialog).getByRole("button", { name: "確定" }));
    await waitFor(() => {
      expect(updateOutbound).toHaveBeenCalledWith({
        orderId: "order-june-out",
        customerId: "cust-ylp",
        shippingMethodId: "ship-1",
        orderNumber: "F260728-0002",
        shippingDate: "2026-07-28",
        remarks: "3:00pm",
        contactPerson: "陳生",
        phone: "98401200",
        address: "Room 2418",
        lines: [
          {
            preparedMeatItemId: "item-1",
            rawMeatItemId: null,
            quantity: 5,
            remarks: "june out",
          },
        ],
      });
    });
    expect(sendToFactory).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "確定" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "送到工場" })).toBeInTheDocument();
  });

  it("shows an error when outbound edit has no matching delivery note", async () => {
    const user = userEvent.setup();
    const loadItems = vi.fn().mockResolvedValue(items);
    const loadMovements = vi.fn().mockResolvedValue([
      {
        ...movementsByItem["item-1"]![0],
        meatOrderId: null,
      },
    ]);
    const loadOutbound = vi.fn();

    render(
      <MemoryRouter>
        <PreparedMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
          loadCustomers={async () => []}
          loadShippingMethods={async () => []}
          loadRawItems={async () => []}
          loadStock={async () => plentyOfStock}
          loadOutbound={loadOutbound}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("桂花小幸 YLP")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "出貨編輯" }));

    const dialog = await screen.findByRole("dialog", { name: "送貨單" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "找不到對應送貨單",
    );
    expect(loadOutbound).not.toHaveBeenCalled();
  });

  it("rejects outbound add quantities that are not positive or exceed stock", async () => {
    const user = userEvent.setup();
    const loadItems = vi.fn().mockResolvedValue(items);
    const loadMovements = vi.fn().mockResolvedValue([]);
    const loadCustomers = vi.fn().mockResolvedValue([
      {
        id: "cust-ylp",
        customerCode: "C0085",
        name: "桂花小幸 YLP",
        contactPerson: "阿國 / 懷哥",
        phone: "9899 1980",
        address: "元朗廣場",
        deliveryNoteRequired: true,
      },
    ]);
    const loadStock = vi.fn().mockResolvedValue({
      prepared: { "item-1": 3 },
      raw: {},
    });

    render(
      <MemoryRouter>
        <PreparedMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
          loadCustomers={loadCustomers}
          loadShippingMethods={async () => []}
          loadOrderNumber={async () => "R - 202608 - 1"}
          loadRawItems={async () => []}
          loadStock={loadStock}
        />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "製成品出貨" }));
    const dialog = await screen.findByRole("dialog", { name: "送貨單" });
    await waitFor(() => {
      expect(within(dialog).getByRole("combobox", { name: "客戶" })).toBeEnabled();
    });
    await waitFor(() => {
      expect(loadStock).toHaveBeenCalled();
    });

    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "客戶" }),
      "cust-ylp",
    );
    await user.click(within(dialog).getByRole("combobox", { name: "製成品" }));
    await user.click(within(dialog).getByRole("option", { name: "五香牛腩" }));

    await user.click(within(dialog).getByRole("button", { name: "加入" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "請輸入大於 0 的數量",
    );

    await user.type(within(dialog).getByRole("textbox", { name: "製成品數量" }), "0");
    await user.click(within(dialog).getByRole("button", { name: "加入" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "請輸入大於 0 的數量",
    );

    const quantity = within(dialog).getByRole("textbox", { name: "製成品數量" });
    await user.clear(quantity);
    await user.type(quantity, "4");
    await user.click(within(dialog).getByRole("button", { name: "加入" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "加入數量不能超過現存數量（現存 3）",
    );
    expect(within(dialog).getByText("尚未加入貨品")).toBeInTheDocument();

    await user.clear(quantity);
    await user.type(quantity, "2");
    await user.click(within(dialog).getByRole("button", { name: "加入" }));
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(
      within(dialog.querySelector(".prepared-meat-outbound-lines") as HTMLElement).getByText(
        "五香牛腩",
      ),
    ).toBeInTheDocument();

    await user.type(
      within(dialog).getByRole("textbox", { name: "製成品數量" }),
      "2",
    );
    await user.click(within(dialog).getByRole("button", { name: "加入" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "加入數量不能超過現存數量（現存 1）",
    );
  });
});
