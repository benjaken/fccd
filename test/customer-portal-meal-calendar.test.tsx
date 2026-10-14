import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { CustomerPortalMealCalendarPage } from "@/components/settings/CustomerPortalMealCalendarPage";
import { hongKongTodayKey, mealSummary } from "@/lib/customer-portal-meal-calendar";
import "@/lib/customer-portal-i18n";

const list = vi.hoisted(() => vi.fn());
const calendar = vi.hoisted(() => vi.fn());
const saveHoliday = vi.hoisted(() => vi.fn());
vi.mock("@/auth/use-page-access", () => ({ useCurrentPageAccess: () => ({ canAccess: () => true }) }));
vi.mock("@/lib/customer-portal-meal-calendar", async (original) => ({
  ...await original<typeof import("@/lib/customer-portal-meal-calendar")>(),
  listMealCalendarOrders: list,
}));
vi.mock("@/lib/customer-portal-calendar-ops", () => ({
  listGroupCalendar: calendar,
  setOrderBlackout: saveHoliday,
}));

const today = hongKongTodayKey();
const first = {
  order_id: "00000000-0000-0000-0000-0000000000a1",
  order_number: "FC-9001",
  organization_id: "org-a",
  organization_name: "恒隆集團",
  service_date: today,
  delivery_time: "12:00",
  delivery_status: "未派車隊",
  document_type: "order",
  brand: "FCC",
  address: "中環總部",
  lines: [{ name: "叉燒飯", quantity: 2 }, { name: "例湯", quantity: 1 }],
};
const second = {
  ...first,
  order_id: "00000000-0000-0000-0000-0000000000a2",
  order_number: "FC-9002",
  organization_id: "org-b",
  organization_name: "李氏公司",
  address: "九龍倉",
  lines: [{ name: "魚香茄子", quantity: 3 }],
};

beforeEach(() => {
  list.mockReset().mockResolvedValue([first, second]);
  calendar.mockReset().mockResolvedValue({ blackouts: [], openings: [] });
  saveHoliday.mockReset().mockResolvedValue(undefined);
});

it("shows which group customer ordered which meals", async () => {
  render(<MemoryRouter><CustomerPortalMealCalendarPage /></MemoryRouter>);
  expect(await screen.findByRole("button", { name: `恒隆集團 · ${mealSummary(first.lines)}` })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: new RegExp(today) }));
  expect(await screen.findByRole("heading", { name: "恒隆集團" })).toBeInTheDocument();
  expect(screen.getByText("叉燒飯")).toBeInTheDocument();
  expect(screen.getByText("×2")).toBeInTheDocument();
  expect(screen.getByText("例湯")).toBeInTheDocument();
  expect(screen.getByText("中環總部")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("團體客戶"), { target: { value: "org-b" } });
  expect(screen.queryByRole("heading", { name: "恒隆集團" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "李氏公司" })).toBeInTheDocument();
  expect(screen.getByText("魚香茄子")).toBeInTheDocument();
});

it("shows the open company menu and can close a holiday", async () => {
  calendar.mockResolvedValue({
    blackouts: [],
    openings: [{
      organization_id: "org-a",
      organization_name: "恒隆集團",
      menu_id: "menu-1",
      menu_name: "午市餐牌",
      brand: "到會",
      delivery_date: "2000-01-01",
      valid_until: "2099-12-31",
    }],
  });
  render(<MemoryRouter><CustomerPortalMealCalendarPage /></MemoryRouter>);
  expect(await screen.findAllByRole("button", { name: "恒隆集團 · 午市餐牌" })).not.toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: new RegExp(today) }));
  expect(await screen.findByRole("link", { name: "恒隆集團 · 午市餐牌" })).toHaveAttribute("href", "/settings/customer-portal/org-a/menus/menu-1");
  fireEvent.change(screen.getByLabelText("節日名稱"), { target: { value: "國慶" } });
  fireEvent.click(screen.getByRole("button", { name: "設為禁單" }));
  await waitFor(() => expect(saveHoliday).toHaveBeenCalledWith(today, "國慶"));
});
