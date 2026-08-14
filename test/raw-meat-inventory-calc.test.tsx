import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RawMeatInventoryCalcPage } from "@/components/RawMeatInventoryCalcPage";
import i18n from "@/i18n";
import type {
  RawMeatItemOption,
  RawMeatMovementRow,
} from "@/lib/raw-meat-inventory";

const items: RawMeatItemOption[] = [
  {
    id: "item-1",
    name: "乾冬菇 (廣信)",
    englishName: null,
    sortOrder: 1,
    canShipDirectly: true,
    isActive: true,
  },
  {
    id: "item-2",
    name: "羊腩(生)",
    englishName: null,
    sortOrder: 2,
    canShipDirectly: false,
    isActive: true,
  },
];

const movementsByItem: Record<string, RawMeatMovementRow[]> = {
  "item-1": [
    {
      id: "move-2",
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
      expect(loadMovements).toHaveBeenCalledWith("item-1", "乾冬菇 (廣信)");
    });

    expect(await screen.findAllByText("廣聯興")).not.toHaveLength(0);
    expect(screen.getByText("5 kg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增生肉選項" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "生肉入貨" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "生肉出貨" })).toBeDisabled();
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
      expect(loadMovements).toHaveBeenCalledWith("item-2", "羊腩(生)");
    });

    expect(await screen.findByText("新豐凍肉 (SFFM)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "羊腩(生)" })).toHaveAttribute(
      "aria-current",
      "true",
    );
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
});
