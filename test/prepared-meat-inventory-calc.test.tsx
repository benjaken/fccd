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
    const createOutbound = vi.fn().mockResolvedValue("order-1");

    render(
      <MemoryRouter>
        <PreparedMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
          loadCustomers={loadCustomers}
          loadShippingMethods={loadShippingMethods}
          loadOrderNumber={loadOrderNumber}
          createOutbound={createOutbound}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "新增製成品選項" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "製成品入貨(扣原料)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "製成品入貨(無原料)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "管理送貨單" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "製成品出貨" }));

    const dialog = await screen.findByRole("dialog", { name: "送貨單" });
    expect(dialog).toHaveClass("side-panel-xl");

    const shipping = within(dialog).getByRole("combobox", { name: "送貨方式" });
    expect(shipping).toBeDisabled();

    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "客戶" }),
      "cust-ylp",
    );
    expect(shipping).toBeEnabled();
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
    await user.click(within(dialog).getByRole("button", { name: "確定" }));
    expect(shipping).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: "數量" }), "2");
    await user.click(within(dialog).getByRole("button", { name: "加入" }));

    const lines = dialog.querySelector(".prepared-meat-outbound-lines");
    expect(lines).not.toBeNull();
    expect(within(lines as HTMLElement).getByText("五香牛腩")).toBeInTheDocument();
    expect(within(lines as HTMLElement).getByText("2")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "傳送到工場" }));
    await waitFor(() => {
      expect(createOutbound).toHaveBeenCalledWith({
        customerId: "cust-ylp",
        shippingMethodId: "ship-1",
        orderNumber: "R - 202608 - 8",
        shippingDate: expect.any(String),
        remarks: "",
        lines: [
          {
            preparedMeatItemId: "item-1",
            quantity: 2,
            remarks: "",
          },
        ],
      });
    });
  });
});
