import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { CustomerPortalLunchboxPage } from "@/components/settings/CustomerPortalLunchboxPage";
import "@/lib/customer-portal-i18n";

const mocks = vi.hoisted(() => ({ edit: true, publish: vi.fn(), menus: vi.fn() }));
vi.mock("@/auth/use-page-access", () => ({ useCurrentPageAccess: () => ({ canAccess: () => mocks.edit }) }));
vi.mock("@/lib/customer-portal-ops", () => ({
  listPortalOpsChannels: async () => [], listPortalOpsProducts: async () => [],
}));
vi.mock("@/lib/customer-lunchbox-ops", () => ({
  listLunchboxes: mocks.menus, listVipCycles: async () => [],
  upsertVipCycle: mocks.publish, setVipCycleMenus: vi.fn(),
  replaceLunchboxItems: vi.fn(), upsertLunchbox: vi.fn(),
}));
beforeEach(() => {
  mocks.edit = true;
  mocks.publish.mockReset();
  mocks.menus.mockResolvedValue([{ id: "menu", name: "Lunch", brand: "FCC", delivery_date: "2026-10-15", delivery_time: "12:00", items: [], is_active: true }]);
});
it("keeps lunch menus visible and opens VIP configuration only when requested", async () => {
  render(<MemoryRouter><CustomerPortalLunchboxPage /></MemoryRouter>);
  await screen.findByText("Lunch");
  expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("週期名稱")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "VIP 訂飯週期" }));
  const dialog = within(await screen.findByRole("dialog"));
  fireEvent.click(dialog.getByRole("button", { name: "發布週期" }));
  expect(await dialog.findByRole("alert")).toBeInTheDocument();
  expect(mocks.publish).not.toHaveBeenCalled();
  fireEvent.click(dialog.getByRole("button", { name: "關閉" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText("Lunch")).toBeInTheDocument();
});
it("hides cycle and creation actions for read-only users", async () => {
  mocks.edit = false;
  render(<MemoryRouter><CustomerPortalLunchboxPage /></MemoryRouter>);
  await screen.findByText("Lunch");
  expect(screen.queryByRole("button", { name: "VIP 訂飯週期" })).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("opens the half-width menu editor with grouped fields and visible item labels", async () => {
  render(<MemoryRouter><CustomerPortalLunchboxPage /></MemoryRouter>);
  await screen.findByText("Lunch");
  fireEvent.click(screen.getByRole("button", { name: "新增飯盒餐單" }));
  const panel = await screen.findByRole("dialog");
  expect(panel).toHaveClass("side-panel-half", "lunchbox-editor-panel");
  const dialog = within(panel);
  expect(dialog.getByRole("group", { name: "餐單資料" })).toBeInTheDocument();
  expect(dialog.getByRole("group", { name: "送貨與截單安排" })).toBeInTheDocument();
  fireEvent.click(dialog.getByRole("button", { name: "加入餐點" }));
  expect(dialog.getByLabelText("產品")).toBeInTheDocument();
  expect(dialog.getByLabelText("單價")).toBeInTheDocument();
  expect(dialog.getByLabelText("可訂數量")).toHaveValue(1);
});
