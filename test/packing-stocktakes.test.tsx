import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PackingStocktakesPage } from "@/components/PackingStocktakesPage";
import i18n from "@/i18n";
import type { PackingStocktakeItem } from "@/lib/packing-stocktakes";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { app_metadata: { role: "Super Admin" } }, profile: { role: "Super Admin" } }),
}));

const records: PackingStocktakeItem[] = [{
  id: "packing-1", stocktakeAt: "2026-08-10T00:00:00.000Z", sku: "LKO001-B",
  ingredientType: "包裝用品", name: "芝士汁粉", quantity: 12, unit: "包",
  supplierName: "測試供應商", supplierPhone: "2345 6789",
}];

describe("Packaging stocktake records page", () => {
  beforeEach(async () => { vi.restoreAllMocks(); await i18n.changeLanguage("zh-HK"); });

  function dateButton(dateList: HTMLElement, date: string) {
    const button = dateList.querySelector<HTMLButtonElement>(`button[data-stocktake-date="${date}"]`);
    if (!button) throw new Error(`Missing stocktake date ${date}`);
    return button;
  }

  it("uses the operational table and saves a clicked quantity without an edit button", async () => {
    const user = userEvent.setup();
    const saveQuantity = vi.fn().mockResolvedValue(18);
    render(<MemoryRouter><PackingStocktakesPage canEdit loadDates={vi.fn().mockResolvedValue([{ date: "2026-08-10" }])} loadRows={vi.fn().mockResolvedValue({ items: records, total: 1 })} saveQuantity={saveQuantity} /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "包裝盤點記錄" })).toBeInTheDocument();
    const dateList = await screen.findByRole("complementary", { name: "盤點日期列表" });
    await user.click(dateButton(dateList, "2026-08-10"));
    expect(screen.getByRole("columnheader", { name: "盤點數量" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "編輯" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "修改「芝士汁粉」的盤點數量" }));
    const input = screen.getByRole("spinbutton", { name: "修改「芝士汁粉」的盤點數量" });
    await user.clear(input);
    await user.type(input, "18");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(saveQuantity).toHaveBeenCalledWith("packing-1", 18));
    expect(await screen.findByRole("button", { name: "修改「芝士汁粉」的盤點數量" })).toHaveTextContent("18");
  });

  it("opens the selected date even when all eligible rows already exist", async () => {
    const user = userEvent.setup();
    const loadRows = vi.fn().mockResolvedValue({ items: records, total: 1 });
    const createStocktake = vi.fn().mockResolvedValue(0);
    render(<MemoryRouter><PackingStocktakesPage canEdit loadDates={vi.fn().mockResolvedValue([])} loadRows={loadRows} createStocktake={createStocktake} /></MemoryRouter>);

    await screen.findByRole("heading", { name: "包裝盤點記錄" });
    await user.click(screen.getByRole("button", { name: "新增盤點記錄" }));
    const dialog = screen.getByRole("dialog", { name: "新增包裝盤點記錄" });
    const dateInput = screen.getByLabelText("盤點日期");
    await user.clear(dateInput);
    await user.type(dateInput, "2026-08-18");
    await user.click(screen.getByRole("button", { name: "下一步" }));

    await waitFor(() => expect(createStocktake).toHaveBeenCalledWith("2026-08-18"));
    await waitFor(() => expect(loadRows).toHaveBeenLastCalledWith({ page: 1, search: "", stocktakeDate: "2026-08-18" }));
    expect(dialog).not.toBeInTheDocument();
  });

  it("opens the supplier-grouped stocktake sheet in a new page", async () => {
    const user = userEvent.setup();
    const loadPrintRows = vi.fn().mockResolvedValue(records);
    const printDocument = document.implementation.createHTMLDocument();
    const printWindow = { document: printDocument, close: vi.fn(), opener: window } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(printWindow);
    render(<MemoryRouter><PackingStocktakesPage canEdit loadDates={vi.fn().mockResolvedValue([{ date: "2026-08-10", updatedAt: "2026-08-10T01:00:00Z" }])} loadRows={vi.fn().mockResolvedValue({ items: records, total: 1 })} loadPrintRows={loadPrintRows} /></MemoryRouter>);

    const dateList = await screen.findByRole("complementary", { name: "盤點日期列表" });
    await user.click(dateButton(dateList, "2026-08-10"));
    await screen.findByText("芝士汁粉");
    await user.click(screen.getByRole("button", { name: "列印盤點紙" }));

    await waitFor(() => expect(loadPrintRows).toHaveBeenCalledWith("2026-08-10"));
    await waitFor(() => expect(printDocument.body.textContent).toContain("芝士汁粉"));
    expect(printDocument.body.textContent).toContain("測試供應商");
    expect(printDocument.body.textContent).toContain("2345 6789");
    expect(printDocument.querySelectorAll(".column")).toHaveLength(4);
    expect(printDocument.querySelectorAll(".count-input")).toHaveLength(1);
    expect(printDocument.querySelector("tbody tr td:first-child")?.textContent).toBe("芝士汁粉");
    expect(printDocument.querySelector("tbody tr td:first-child")?.getAttribute("colspan")).toBe("2");
    expect(printDocument.querySelectorAll("colgroup col")).toHaveLength(4);
    expect(printDocument.querySelector(".unit")?.textContent).toBe("包");
    await waitFor(() => expect(printDocument.querySelector("#stocktake-print-action button")?.textContent).toContain("列印"));
  });

  it("closes the new page and reports an error when print rows fail to load", async () => {
    const user = userEvent.setup();
    const printDocument = document.implementation.createHTMLDocument();
    const close = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({ document: printDocument, close, opener: window } as unknown as Window);
    render(<MemoryRouter><PackingStocktakesPage canEdit loadDates={vi.fn().mockResolvedValue([{ date: "2026-08-10", updatedAt: "2026-08-10T01:00:00Z" }])} loadRows={vi.fn().mockResolvedValue({ items: records, total: 1 })} loadPrintRows={vi.fn().mockRejectedValue(new Error("load failed"))} /></MemoryRouter>);

    const dateList = await screen.findByRole("complementary", { name: "盤點日期列表" });
    await user.click(dateButton(dateList, "2026-08-10"));
    await screen.findByText("芝士汁粉");
    await user.click(screen.getByRole("button", { name: "列印盤點紙" }));

    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(await screen.findByText("無法載入盤點紙，請重試。")).toBeInTheDocument();
  });
});
