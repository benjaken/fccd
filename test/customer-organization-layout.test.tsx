import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { CustomerPortalOpsPage } from "@/components/settings/CustomerPortalOpsPage";
import "@/lib/customer-portal-i18n";

const mocks = vi.hoisted(() => ({ edit: true, assign: vi.fn(), getOrg: vi.fn() }));
vi.mock("@/auth/use-page-access", () => ({ useCurrentPageAccess: () => ({ canAccess: () => mocks.edit }) }));
vi.mock("@/lib/customer-portal-ops", async original => ({
  ...await original<typeof import("@/lib/customer-portal-ops")>(),
  getPortalOpsOrg: () => mocks.getOrg(),
  listPortalOpsChannels: async () => [{ id: "channel", name: "Catering" }],
  listPortalOpsProducts: async () => [], assignPortalOpsAdmin: mocks.assign,
}));
const mount = () => render(<MemoryRouter initialEntries={["/settings/customer-portal/org"]}><Routes><Route path="/settings/customer-portal/:orgId" element={<CustomerPortalOpsPage />} /></Routes></MemoryRouter>);
beforeEach(() => {
  mocks.edit = true;
  mocks.assign.mockReset().mockResolvedValue(undefined);
  mocks.getOrg.mockReset().mockResolvedValue({ id: "org", name: "Test Organization", is_active: true, members: [{ user_id: "user", email: "admin@example.com", role: "admin", is_active: true }], menus: [] });
});
it("shows the detail skeleton, not the list skeleton, while the organization loads", () => {
  mocks.getOrg.mockReturnValue(new Promise(() => {}));
  mount();
  expect(screen.getByRole("link", { name: "返回機構列表" })).toBeInTheDocument();
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
});
it("keeps organization and member information visible while assigning an admin in a side panel", async () => {
  mount();
  await screen.findByText("Test Organization");
  expect(screen.getByText("admin@example.com")).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "指定管理員" }));
  const panel = within(await screen.findByRole("dialog"));
  fireEvent.change(panel.getByRole("textbox"), { target: { value: "next@example.com" } });
  fireEvent.submit(panel.getByRole("textbox").closest("form")!);
  await screen.findByRole("status");
  expect(mocks.assign).toHaveBeenCalledWith("org", "next@example.com");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("retains the assignment form when the service fails", async () => {
  mocks.assign.mockRejectedValue(new Error("failed")); mount();
  fireEvent.click(await screen.findByRole("button", { name: "指定管理員" }));
  const panel = within(screen.getByRole("dialog"));
  fireEvent.change(panel.getByRole("textbox"), { target: { value: "next@example.com" } });
  fireEvent.submit(panel.getByRole("textbox").closest("form")!);
  expect(await panel.findByRole("alert")).toBeInTheDocument();
  expect(panel.getByRole("textbox")).toHaveValue("next@example.com");
});
it("does not offer assignment to read-only users", async () => {
  mocks.edit = false; mount(); await screen.findByText("Test Organization");
  expect(screen.queryByRole("button", { name: "指定管理員" })).not.toBeInTheDocument();
});
it("groups menu fields with shared date and time controls and allows closing without saving", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "新增餐單" }));
  const panel = within(await screen.findByRole("dialog"));
  expect(panel.getByRole("group", { name: "基本資料" })).toBeInTheDocument();
  expect(panel.getByRole("group", { name: "供餐安排" })).toBeInTheDocument();
  expect(panel.getByRole("combobox", { name: "品牌" })).toBeInTheDocument();
  expect(panel.getByRole("button", { name: "送貨時間" })).toBeInTheDocument();
  expect(panel.getByRole("button", { name: "儲存" })).toBeInTheDocument();
  fireEvent.click(panel.getAllByRole("button", { name: "關閉" }).at(-1)!);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("shows organization flags in a settings group", async () => {
  mount(); fireEvent.click(await screen.findByRole("button", { name: "編輯機構" }));
  const panel = within(await screen.findByRole("dialog"));
  expect(panel.getByRole("group", { name: "設定" })).toBeInTheDocument();
  expect(panel.getByRole("textbox", { name: "機構名稱" })).toHaveValue("Test Organization");
  expect(panel.getAllByRole("switch")).toHaveLength(2);
});
