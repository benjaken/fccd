import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { CustomerPortalLunchboxPage } from "@/components/settings/CustomerPortalLunchboxPage";
import "@/lib/customer-portal-i18n";

const mocks = vi.hoisted(() => ({ edit: true, menus: vi.fn() }));
vi.mock("@/auth/use-page-access", () => ({ useCurrentPageAccess: () => ({ canAccess: () => mocks.edit }) }));
vi.mock("@/lib/customer-portal-ops", () => ({
  listPortalOpsChannels: async () => [], listPortalOpsProducts: async () => [],
}));
vi.mock("@/lib/customer-lunchbox-ops", () => ({
  listLunchboxes: mocks.menus, upsertLunchbox: vi.fn(), deleteLunchbox: vi.fn(), replaceLunchboxItems: vi.fn(),
}));
const menu = { id: "menu", name: "Lunch", brand: "FCC", channel_id: "ch", delivery_date: "2026-10-15", delivery_time: "12:00", cutoff_at: "2026-10-15T10:00:00Z", shipping_fee: 0, items: [], is_active: true, is_vip: false };
beforeEach(() => {
  mocks.edit = true;
  mocks.menus.mockResolvedValue([menu]);
});
it("keeps lunch menus visible and only exposes the VIP switch inside the menu editor", async () => {
  render(<MemoryRouter><CustomerPortalLunchboxPage /></MemoryRouter>);
  await screen.findByText("Lunch");
  expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  expect(screen.queryByRole("switch", { name: "VIP 訂飯" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "新增飯盒餐單" }));
  const dialog = within(await screen.findByRole("dialog"));
  const vip = dialog.getByRole("switch", { name: "VIP 訂飯" });
  expect(vip).not.toBeChecked();
  fireEvent.click(vip);
  expect(vip).toBeChecked();
});
it("opens a VIP menu with the VIP switch already on", async () => {
  mocks.menus.mockResolvedValue([{ ...menu, is_vip: true }]);
  render(<MemoryRouter><CustomerPortalLunchboxPage /></MemoryRouter>);
  await screen.findByText("Lunch");
  fireEvent.click(screen.getByRole("button", { name: "編輯" }));
  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByRole("switch", { name: "VIP 訂飯" })).toBeChecked();
});
it("hides creation and row actions for read-only users", async () => {
  mocks.edit = false;
  render(<MemoryRouter><CustomerPortalLunchboxPage /></MemoryRouter>);
  await screen.findByText("Lunch");
  expect(screen.queryByRole("button", { name: "新增飯盒餐單" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "編輯" })).not.toBeInTheDocument();
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
