import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SuppliersPage } from "@/components/SuppliersPage";
import i18n from "@/i18n";
import type { SupplierRow } from "@/lib/suppliers";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { app_metadata: { role: "Super Admin" } },
    profile: { role: "Super Admin" },
  }),
}));

const rows: SupplierRow[] = [
  {
    id: "s-1",
    companyName: "A-Mart 浩運食品",
    contactPerson: "蔡生",
    phoneNumber: "9802 9338",
    deliverySchedule: "星期一",
    paymentSchedule: "日結",
    comment: "可靠",
    isActive: true,
    suppliesRawMeat: true,
    suppliesRestaurantIngredients: false,
    createdAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "s-2",
    companyName: "三潤",
    contactPerson: "-",
    phoneNumber: "2728 8299",
    deliverySchedule: null,
    paymentSchedule: "半月結",
    comment: null,
    isActive: false,
    suppliesRawMeat: false,
    suppliesRestaurantIngredients: true,
    createdAt: "2026-08-02T00:00:00.000Z",
  },
];

function filterSuppliers(
  source: SupplierRow[],
  filters: { search?: string; status?: "" | "active" | "inactive" } = {},
) {
  const search = filters.search?.trim() ?? "";
  const status = filters.status ?? "";
  return source.filter((row) => {
    const searchMatch =
      !search ||
      `${row.companyName} ${row.contactPerson ?? ""} ${row.phoneNumber ?? ""}`
        .toLocaleLowerCase("zh-HK")
        .includes(search.toLocaleLowerCase("zh-HK"));
    const statusMatch =
      !status || (status === "active" ? row.isActive : !row.isActive);
    return searchMatch && statusMatch;
  });
}

describe("Supplier records page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("lists suppliers with all requested columns", async () => {
    const loadSuppliers = vi.fn().mockResolvedValue(structuredClone(rows));

    render(
      <MemoryRouter>
        <SuppliersPage loadSuppliers={loadSuppliers} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "供應商記錄" })).toBeInTheDocument();
    expect(screen.getByText("A-Mart 浩運食品")).toBeInTheDocument();
    expect(screen.getByText("三潤")).toBeInTheDocument();

    for (const header of [
      "供應商",
      "聯絡人",
      "電話號碼",
      "凍肉供應",
      "餐廳食材",
      "評價",
      "送貨車期",
      "結算週期",
      "狀態",
    ]) {
      expect(
        screen.getByRole("columnheader", { name: header }),
      ).toBeInTheDocument();
    }
  });

  it("filters by search term from the search bar", async () => {
    const user = userEvent.setup();
    const loadSuppliers = vi
      .fn()
      .mockImplementation(async (filters = {}) =>
        filterSuppliers(structuredClone(rows), filters),
      );

    render(
      <MemoryRouter>
        <SuppliersPage loadSuppliers={loadSuppliers} />
      </MemoryRouter>,
    );

    await screen.findByText("A-Mart 浩運食品");
    await user.type(
      screen.getByPlaceholderText("搜尋供應商、聯絡人、電話或評價"),
      "三潤",
    );
    await user.click(screen.getByRole("button", { name: "搜尋" }));

    await waitFor(() => {
      expect(loadSuppliers).toHaveBeenLastCalledWith({
        search: "三潤",
        status: "",
      });
    });

    expect(await screen.findByText("三潤")).toBeInTheDocument();
    expect(screen.queryByText("A-Mart 浩運食品")).not.toBeInTheDocument();
  });

  it("filters by active status", async () => {
    const user = userEvent.setup();
    const loadSuppliers = vi
      .fn()
      .mockImplementation(async (filters = {}) =>
        filterSuppliers(structuredClone(rows), filters),
      );

    render(
      <MemoryRouter>
        <SuppliersPage loadSuppliers={loadSuppliers} />
      </MemoryRouter>,
    );

    await screen.findByText("A-Mart 浩運食品");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "狀態" }),
      "active",
    );

    await waitFor(() => {
      expect(loadSuppliers).toHaveBeenLastCalledWith({
        search: "",
        status: "active",
      });
    });

    expect(await screen.findByText("A-Mart 浩運食品")).toBeInTheDocument();
    expect(screen.queryByText("三潤")).not.toBeInTheDocument();
  });

  it("opens the detail panel from the 查看詳細 button", async () => {
    const user = userEvent.setup();
    const loadSuppliers = vi.fn().mockResolvedValue(structuredClone(rows));

    render(
      <MemoryRouter>
        <SuppliersPage loadSuppliers={loadSuppliers} />
      </MemoryRouter>,
    );

    await screen.findByText("A-Mart 浩運食品");
    await user.click(
      screen.getByRole("button", { name: "查看 A-Mart 浩運食品 的詳細資料" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "A-Mart 浩運食品" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("蔡生").length).toBeGreaterThan(0);
    expect(screen.getAllByText("9802 9338").length).toBeGreaterThan(0);
    expect(screen.getAllByText("可靠").length).toBeGreaterThan(0);
  });

  it("hides the view-detail button without action permission", async () => {
    const loadSuppliers = vi.fn().mockResolvedValue(structuredClone(rows));

    render(
      <MemoryRouter>
        <SuppliersPage loadSuppliers={loadSuppliers} canViewDetail={false} />
      </MemoryRouter>,
    );

    await screen.findByText("A-Mart 浩運食品");
    expect(
      screen.queryByRole("button", { name: "查看詳細" }),
    ).not.toBeInTheDocument();
  });

  it("shows an empty state when no suppliers match", async () => {
    const loadSuppliers = vi.fn().mockResolvedValue([]);

    render(
      <MemoryRouter>
        <SuppliersPage loadSuppliers={loadSuppliers} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("未找到供應商")).toBeInTheDocument();
  });
});
