import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";

const api = vi.hoisted(() => ({
  loadEntries: vi.fn(),
}));

const suppliers = [
  { id: "supplier-1", legacyId: "supplier-legacy-1", name: "嘉明海產 (GMP)" },
  { id: "supplier-2", legacyId: "supplier-legacy-2", name: "新豐凍肉 (SFFM)" },
];
const purchaseTypes = [
  { id: "fcc", legacyId: "fcc-legacy", name: "FCC 到會" },
  { id: "sundries", legacyId: "sundries-legacy", name: "清潔/SUNDRIES" },
];

vi.mock("@/lib/kitchen-supplier-records", () => ({
  fetchKitchenSupplierOptions: vi.fn(async () => suppliers),
  fetchKitchenSupplierPurchaseTypes: vi.fn(async () => purchaseTypes),
  fetchKitchenSupplierRecords: vi.fn(async () => ({ items: [], total: 0 })),
  fetchKitchenSupplierCostEntries: api.loadEntries,
  saveKitchenSupplierRecord: vi.fn(),
  updateKitchenSupplierCostEntry: vi.fn(),
  deleteKitchenSupplierCostEntry: vi.fn(),
}));

import { KitchenMonthlySupplierRecords } from "@/components/KitchenMonthlySupplierRecords";

describe("central kitchen supplier expense editor", () => {
  it("filters entries by supplier and category and keeps pagination below the table", async () => {
    await i18n.changeLanguage("zh-HK");
    api.loadEntries.mockReset().mockResolvedValue({ items: [], total: 0 });
    const user = userEvent.setup();
    render(<KitchenMonthlySupplierRecords canEdit />);

    await user.click(await screen.findByRole("button", { name: "編輯費用記錄" }));
    const dialog = screen.getByRole("dialog", { name: "編輯費用記錄" });
    await user.click(within(dialog).getByRole("combobox", { name: "供應商" }));
    await user.click(screen.getByRole("option", { name: suppliers[0].name }));
    await user.click(within(dialog).getByRole("combobox", { name: "分類" }));
    await user.click(screen.getByRole("option", { name: purchaseTypes[1].name }));

    await waitFor(() => expect(api.loadEntries).toHaveBeenLastCalledWith(expect.objectContaining({
      filters: expect.objectContaining({
        supplierIds: ["supplier-1"],
        purchaseTypeIds: ["sundries"],
      }),
    })));

    const body = dialog.querySelector(".side-panel-body");
    expect(body?.children[0]).toHaveClass("kitchen-supplier-entry-toolbar");
    expect(body?.children[1]).toHaveClass("kitchen-supplier-entry-table-wrap");
    expect(body?.children[2]).toHaveClass("operational-list-pagination");
  });
});
