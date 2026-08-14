import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RawMeatInventoryCalcPage } from "@/components/RawMeatInventoryCalcPage";
import i18n from "@/i18n";
import {
  currentHongKongYear,
  DEFAULT_RAW_MEAT_UNIT_MULTIPLIERS,
  type RawMeatItemOption,
  type RawMeatMovementRow,
} from "@/lib/raw-meat-inventory";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { app_metadata: { role: "Super Admin" } },
    profile: { role: "Super Admin" },
  }),
}));

const currentYear = currentHongKongYear();

const suppliers = [
  { id: "sup-1", name: "廣聯興" },
  { id: "sup-2", name: "萬福 (OFE)" },
  { id: "sup-3", name: "新豐凍肉 (SFFM)" },
];

const items: RawMeatItemOption[] = [
  {
    id: "item-1",
    sku: "LKJ015",
    name: "乾冬菇 (廣信)",
    englishName: "Dried Mushroom",
    sortOrder: 1,
    canShipDirectly: true,
    isActive: true,
    suppliers: [suppliers[0]!],
  },
  {
    id: "item-2",
    sku: "RAW015",
    name: "羊腩(生)",
    englishName: null,
    sortOrder: 2,
    canShipDirectly: false,
    isActive: true,
    suppliers: [suppliers[2]!],
  },
];

const movementsByItem: Record<string, RawMeatMovementRow[]> = {
  "item-1": [
    {
      id: "move-2",
      movementAt: "2026-06-15T04:00:00.000Z",
      productName: "乾冬菇 (廣信)",
      inboundUnitPrice: 130,
      inboundQuantityKg: 1,
      outboundQuantityKg: null,
      balanceKg: 6,
      totalAmount: 130,
      supplierName: "廣聯興",
      remarks: "june remark",
    },
    {
      id: "move-1b",
      movementAt: "2026-05-31T04:00:00.000Z",
      productName: "乾冬菇 (廣信)",
      inboundUnitPrice: 120,
      inboundQuantityKg: 2,
      outboundQuantityKg: null,
      balanceKg: 5,
      totalAmount: 240,
      supplierName: "廣聯興",
      remarks: "remark",
    },
    {
      id: "move-1",
      movementAt: "2026-05-01T04:00:00.000Z",
      productName: "乾冬菇 (廣信)",
      inboundUnitPrice: 100,
      inboundQuantityKg: 3,
      outboundQuantityKg: null,
      balanceKg: 3,
      totalAmount: 300,
      supplierName: "廣聯興",
      remarks: null,
    },
  ],
  "item-2": [
    {
      id: "move-3",
      movementAt: "2026-06-01T04:00:00.000Z",
      productName: "羊腩(生)",
      inboundUnitPrice: 55,
      inboundQuantityKg: 10,
      outboundQuantityKg: null,
      balanceKg: 10,
      totalAmount: 550,
      supplierName: "新豐凍肉 (SFFM)",
      remarks: null,
    },
  ],
};

describe("Raw meat inventory calculation page", () => {
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
        <RawMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "生肉存貨計算" })).toBeInTheDocument();

    const sidebar = screen.getByRole("complementary", { name: "生肉選項" });
    expect(within(sidebar).getByRole("button", { name: "乾冬菇 (廣信)" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(within(sidebar).getByRole("button", { name: "羊腩(生)" })).toBeInTheDocument();

    await waitFor(() => {
      expect(loadMovements).toHaveBeenCalledWith(
        "item-1",
        "乾冬菇 (廣信)",
        currentYear,
      );
    });

    expect(await screen.findAllByText("廣聯興")).not.toHaveLength(0);
    expect(screen.getByText("5 kg")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "年份" })).toHaveValue(
      String(currentYear),
    );

    const heading = screen.getByRole("banner");
    expect(
      within(heading).getByRole("button", { name: "重新整理" }),
    ).toBeEnabled();
    expect(
      within(heading).getByRole("button", { name: "新增生肉選項" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "新建" })).toBeEnabled();
    expect(
      within(heading).getByRole("button", { name: "生肉入貨" }),
    ).toBeEnabled();
    expect(
      within(heading).getByRole("button", { name: "生肉出貨" }),
    ).toBeDisabled();
    expect(screen.queryByText("15")).not.toBeInTheDocument();
  });

  it("switches the right-side ledger when selecting another item", async () => {
    const user = userEvent.setup();
    const loadItems = vi.fn().mockResolvedValue(items);
    const loadMovements = vi
      .fn()
      .mockImplementation(async (itemId: string) => movementsByItem[itemId] ?? []);

    render(
      <MemoryRouter>
        <RawMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
        />
      </MemoryRouter>,
    );

    await screen.findAllByText("廣聯興");

    await user.click(screen.getByRole("button", { name: "羊腩(生)" }));

    await waitFor(() => {
      expect(loadMovements).toHaveBeenCalledWith(
        "item-2",
        "羊腩(生)",
        currentYear,
      );
    });

    expect(await screen.findByText("新豐凍肉 (SFFM)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "羊腩(生)" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("reloads ledger data when the year filter changes", async () => {
    const user = userEvent.setup();
    const loadItems = vi.fn().mockResolvedValue(items);
    const loadMovements = vi
      .fn()
      .mockImplementation(async (itemId: string) => movementsByItem[itemId] ?? []);

    render(
      <MemoryRouter>
        <RawMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(loadMovements).toHaveBeenCalledWith(
        "item-1",
        "乾冬菇 (廣信)",
        currentYear,
      );
    });

    const yearSelect = screen.getByRole("combobox", { name: "年份" });
    await user.selectOptions(yearSelect, "2025");

    await waitFor(() => {
      expect(loadMovements).toHaveBeenCalledWith(
        "item-1",
        "乾冬菇 (廣信)",
        2025,
      );
    });
  });

  it("lets users click a remark, edit it, and save", async () => {
    const user = userEvent.setup();
    const loadItems = vi.fn().mockResolvedValue(items);
    const loadMovements = vi
      .fn()
      .mockImplementation(async (itemId: string) =>
        structuredClone(movementsByItem[itemId] ?? []),
      );
    const saveRemark = vi.fn().mockResolvedValue("更新備註");

    render(
      <MemoryRouter>
        <RawMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
          saveRemark={saveRemark}
        />
      </MemoryRouter>,
    );

    const editButtons = await screen.findAllByRole("button", {
      name: "編輯備註",
    });
    await user.click(editButtons[0]!);

    const input = screen.getByRole("textbox", { name: "編輯備註" });
    await user.clear(input);
    await user.type(input, "更新備註");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(saveRemark).toHaveBeenCalledWith("move-2", "更新備註");
    });

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "編輯備註" })[0],
      ).toHaveTextContent("更新備註");
    });
  });

  it("opens the raw meat options modal from the sidebar header icon", async () => {
    const user = userEvent.setup();
    const loadItems = vi.fn().mockResolvedValue(items);
    const loadMovements = vi
      .fn()
      .mockImplementation(async (itemId: string) =>
        structuredClone(movementsByItem[itemId] ?? []),
      );
    const saveItemFlags = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <RawMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
          saveItemFlags={saveItemFlags}
        />
      </MemoryRouter>,
    );

    await screen.findAllByText("廣聯興");
    await user.click(screen.getByRole("button", { name: "管理生肉選項" }));

    const dialog = await screen.findByRole("dialog", { name: "生肉選項" });
    expect(within(dialog).getByText("排序")).toBeInTheDocument();
    expect(within(dialog).getByText("可直接出貨")).toBeInTheDocument();
    expect(within(dialog).getByText("有效")).toBeInTheDocument();
    expect(within(dialog).getByText("乾冬菇 (廣信)")).toBeInTheDocument();

    const shipSwitch = within(dialog).getByRole("switch", {
      name: "乾冬菇 (廣信) 可直接出貨",
    });
    await user.click(shipSwitch);

    await waitFor(() => {
      expect(saveItemFlags).toHaveBeenCalledWith("item-1", {
        canShipDirectly: false,
        isActive: true,
      });
    });
  });

  it("filters the ledger when a concrete month is selected", async () => {
    const user = userEvent.setup();
    const loadItems = vi.fn().mockResolvedValue(items);
    const loadMovements = vi
      .fn()
      .mockImplementation(async (itemId: string) =>
        structuredClone(movementsByItem[itemId] ?? []),
      );

    render(
      <MemoryRouter>
        <RawMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("june remark")).toBeInTheDocument();
    expect(screen.getByText("remark")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "篩選月份" }));
    const listbox = await screen.findByRole("listbox", { name: "篩選月份" });
    expect(within(listbox).getByRole("option", { name: "全部月份" })).toBeInTheDocument();
    await user.click(within(listbox).getByRole("option", { name: "Jun-26" }));

    expect(await screen.findByText("june remark")).toBeInTheDocument();
    expect(screen.queryByText("remark")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "篩選月份" })).toHaveTextContent(
      "Jun-26",
    );

    const totalRow = screen.getByText("月份總數").closest("tr");
    expect(totalRow).not.toBeNull();
    expect(within(totalRow as HTMLElement).getByText("1.00 kg")).toBeInTheDocument();
    expect(within(totalRow as HTMLElement).getByText("0.00 kg")).toBeInTheDocument();
    expect(within(totalRow as HTMLElement).getByText("HK$130.00")).toBeInTheDocument();
  });

  it("creates a raw meat option with multiple suppliers from the sidebar and toolbar", async () => {
    const user = userEvent.setup();
    const loadItems = vi.fn().mockResolvedValue(structuredClone(items));
    const loadMovements = vi.fn().mockResolvedValue([]);
    const loadSuppliers = vi.fn().mockResolvedValue(suppliers);
    const createItem = vi.fn().mockResolvedValue({
      id: "item-3",
      sku: "RAW099",
      name: "test肉",
      englishName: "Test meat",
      sortOrder: 3,
      canShipDirectly: false,
      isActive: true,
      suppliers: [suppliers[1]!, suppliers[2]!],
    });

    render(
      <MemoryRouter>
        <RawMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
          loadSuppliers={loadSuppliers}
          createItem={createItem}
        />
      </MemoryRouter>,
    );

    await screen.findByRole("button", { name: "乾冬菇 (廣信)" });
    await user.click(screen.getByRole("button", { name: "新建" }));

    const dialog = await screen.findByRole("dialog", { name: "添加選項" });
    await user.type(within(dialog).getByPlaceholderText("code"), "RAW099");
    const nameFields = within(dialog).getAllByPlaceholderText("Type here...");
    await user.type(nameFields[0]!, "test肉");
    await user.type(nameFields[1]!, "Test meat");

    const supplierInput = within(dialog).getByRole("textbox", { name: "供應商" });
    await user.click(supplierInput);
    await user.click(await screen.findByRole("option", { name: "萬福 (OFE)" }));
    await user.click(supplierInput);
    await user.click(await screen.findByRole("option", { name: "新豐凍肉 (SFFM)" }));
    await user.click(within(dialog).getByRole("button", { name: "提交" }));

    await waitFor(() => {
      expect(createItem).toHaveBeenCalledWith({
        sku: "RAW099",
        name: "test肉",
        englishName: "Test meat",
        supplierIds: ["sup-2", "sup-3"],
      });
    });

    expect(await screen.findByRole("button", { name: "test肉" })).toBeInTheDocument();
  });

  it("edits a raw meat option from the row action", async () => {
    const user = userEvent.setup();
    const loadItems = vi.fn().mockResolvedValue(structuredClone(items));
    const loadMovements = vi
      .fn()
      .mockImplementation(async (itemId: string) =>
        structuredClone(movementsByItem[itemId] ?? []),
      );
    const loadSuppliers = vi.fn().mockResolvedValue(suppliers);
    const updateItem = vi.fn().mockImplementation(async (itemId: string) => ({
      ...items.find((item) => item.id === itemId)!,
      name: "乾冬菇 (廣信) 更新",
      suppliers: [suppliers[0]!, suppliers[1]!],
    }));

    render(
      <MemoryRouter>
        <RawMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
          loadSuppliers={loadSuppliers}
          updateItem={updateItem}
        />
      </MemoryRouter>,
    );

    await screen.findAllByText("廣聯興");
    await user.click(
      screen.getByRole("button", { name: "編輯 乾冬菇 (廣信)" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "編輯選項" });
    const nameInput = within(dialog).getByDisplayValue("乾冬菇 (廣信)");
    await user.clear(nameInput);
    await user.type(nameInput, "乾冬菇 (廣信) 更新");
    await user.click(within(dialog).getByRole("textbox", { name: "供應商" }));
    await user.click(await screen.findByRole("option", { name: "萬福 (OFE)" }));
    await user.click(within(dialog).getByRole("button", { name: "提交" }));

    await waitFor(() => {
      expect(updateItem).toHaveBeenCalledWith("item-1", {
        sku: "LKJ015",
        name: "乾冬菇 (廣信) 更新",
        englishName: "Dried Mushroom",
        supplierIds: ["sup-1", "sup-2"],
      });
    });
  });

  it("records stock in using the option suppliers and calculated totals", async () => {
    const user = userEvent.setup();
    const loadItems = vi.fn().mockResolvedValue(structuredClone(items));
    const loadMovements = vi
      .fn()
      .mockImplementation(async (itemId: string) =>
        structuredClone(movementsByItem[itemId] ?? []),
      );
    const createStockIn = vi.fn().mockResolvedValue("move-new");
    const loadUnitMultipliers = vi
      .fn()
      .mockResolvedValue(DEFAULT_RAW_MEAT_UNIT_MULTIPLIERS);

    render(
      <MemoryRouter>
        <RawMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
          createStockIn={createStockIn}
          loadUnitMultipliers={loadUnitMultipliers}
        />
      </MemoryRouter>,
    );

    await screen.findAllByText("廣聯興");
    await user.click(screen.getByRole("button", { name: "生肉入貨" }));

    const dialog = await screen.findByRole("dialog", { name: "生肉入貨" });
    expect(within(dialog).getByText("乾冬菇 (廣信)")).toBeInTheDocument();
    expect(within(dialog).getByText("廣聯興")).toBeInTheDocument();

    await user.type(
      within(dialog).getByRole("textbox", { name: "來貨價" }),
      "23",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "入貨" }),
      "3",
    );

    expect(
      within(dialog).getByRole("textbox", { name: "來貨價 (kg)" }),
    ).toHaveValue("$38.02");
    expect(
      within(dialog).getByRole("textbox", { name: "入貨 (kg)" }),
    ).toHaveValue("1.8149");
    expect(
      within(dialog).getByRole("textbox", { name: "總額 HKD" }),
    ).toHaveValue("$69");

    await user.click(within(dialog).getByRole("button", { name: "提交" }));

    await waitFor(() => {
      expect(createStockIn).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: "item-1",
          supplierId: "sup-1",
          unit: "斤",
          unitPrice: 23,
          quantity: 3,
        }),
      );
    });
  });

  it("hides create and edit without action permission", async () => {
    const loadItems = vi.fn().mockResolvedValue(structuredClone(items));
    const loadMovements = vi.fn().mockResolvedValue([]);

    render(
      <MemoryRouter>
        <RawMeatInventoryCalcPage
          loadItems={loadItems}
          loadMovements={loadMovements}
          canCreate={false}
          canEdit={false}
          canStockIn={false}
        />
      </MemoryRouter>,
    );

    await screen.findByRole("button", { name: "乾冬菇 (廣信)" });
    expect(screen.queryByRole("button", { name: "新增生肉選項" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新建" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "編輯 乾冬菇 (廣信)" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生肉入貨" })).toBeDisabled();
  });
});
