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
    cateringIngredients: [
      { id: "i-1", name: "唐揚雞塊 1kg裝" },
      { id: "i-2", name: "屋台小籠包" },
      { id: "i-3", name: "帶殼蟶子" },
      { id: "i-4", name: "法式8支骨羊架" },
    ],
    rawMeatItems: [{ id: "r-1", name: "羊腩(生)" }],
    restaurantIngredients: [],
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
    cateringIngredients: [],
    rawMeatItems: [],
    restaurantIngredients: [
      { id: "ri-1", name: "台灣面" },
      { id: "ri-2", name: "白方皮" },
      { id: "ri-3", name: "鮮過橋米線" },
    ],
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
      "到會食材",
      "凍肉供應",
      "餐廳食材",
      "送貨車期",
      "結算週期",
      "狀態",
    ]) {
      expect(
        screen.getByRole("columnheader", { name: header }),
      ).toBeInTheDocument();
    }
  });

  it("shows the first three linked items and a more button that opens details", async () => {
    const user = userEvent.setup();
    const loadSuppliers = vi.fn().mockResolvedValue(structuredClone(rows));

    render(
      <MemoryRouter>
        <SuppliersPage loadSuppliers={loadSuppliers} />
      </MemoryRouter>,
    );

    await screen.findByText("A-Mart 浩運食品");

    // First three catering items visible, the fourth hidden behind +1 更多.
    expect(screen.getByText("唐揚雞塊 1kg裝")).toBeInTheDocument();
    expect(screen.getByText("屋台小籠包")).toBeInTheDocument();
    expect(screen.getByText("帶殼蟶子")).toBeInTheDocument();
    expect(screen.queryByText("法式8支骨羊架")).not.toBeInTheDocument();
    const moreButtons = screen
      .getAllByRole("button")
      .map((button) => button.textContent ?? "");
    const moreButtonName = moreButtons.find((name) => name.includes("更多"));
    expect(moreButtonName).toBeDefined();
    const moreButtonEl = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("更多"))!;
    expect(moreButtonEl).toBeInTheDocument();

    // Clicking 更多 opens the detail panel with all four linked items.
    await user.click(moreButtonEl);
    expect(
      await screen.findByRole("dialog", { name: "A-Mart 浩運食品" }),
    ).toBeInTheDocument();
    expect(screen.getByText("法式8支骨羊架")).toBeInTheDocument();
    expect(screen.getAllByText("羊腩(生)").length).toBeGreaterThan(0);
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
      screen.getAllByRole("button", { name: "查看詳細" })[0]!,
    );

    expect(
      await screen.findByRole("dialog", { name: "A-Mart 浩運食品" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("蔡生").length).toBeGreaterThan(0);
    expect(screen.getAllByText("9802 9338").length).toBeGreaterThan(0);
    expect(screen.getAllByText("可靠").length).toBeGreaterThan(0);
    expect(screen.getAllByText("唐揚雞塊 1kg裝").length).toBeGreaterThan(0);
  });

  it("hides all action buttons without action permissions", async () => {
    const loadSuppliers = vi.fn().mockResolvedValue(structuredClone(rows));

    render(
      <MemoryRouter>
        <SuppliersPage
          loadSuppliers={loadSuppliers}
          canViewDetail={false}
          canEdit={false}
          canDelete={false}
        />
      </MemoryRouter>,
    );

    await screen.findByText("A-Mart 浩運食品");
    expect(
      screen.queryByRole("button", { name: "查看詳細" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "編輯" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "刪除" })).not.toBeInTheDocument();
  });

  it("opens the edit panel and updates a supplier", async () => {
    const user = userEvent.setup();
    const loadSuppliers = vi.fn().mockResolvedValue(structuredClone(rows));
    const updateSupplier = vi.fn().mockResolvedValue({
      ...rows[0],
      companyName: "A-Mart 浩運食品 改",
      phoneNumber: "9123 0000",
    });

    render(
      <MemoryRouter>
        <SuppliersPage
          loadSuppliers={loadSuppliers}
          updateSupplier={updateSupplier}
        />
      </MemoryRouter>,
    );

    await screen.findByText("A-Mart 浩運食品");
    await user.click(screen.getAllByRole("button", { name: "編輯" })[0]!);

    await screen.findByRole("dialog", { name: "編輯供應商" });
    const nameInput = screen.getByPlaceholderText("輸入供應商名稱");
    expect(nameInput).toHaveValue("A-Mart 浩運食品");

    await user.clear(nameInput);
    await user.type(nameInput, "A-Mart 浩運食品 改");
    const phoneInput = screen.getByPlaceholderText("電話號碼");
    await user.clear(phoneInput);
    await user.type(phoneInput, "9123 0000");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateSupplier).toHaveBeenCalledWith("s-1", {
        companyName: "A-Mart 浩運食品 改",
        contactPerson: "蔡生",
        phoneNumber: "9123 0000",
        deliverySchedule: "星期一",
        paymentSchedule: "日結",
        comment: "可靠",
        isActive: true,
      });
    });

    expect(await screen.findByText("A-Mart 浩運食品 改")).toBeInTheDocument();
    expect(screen.queryByText("A-Mart 浩運食品")).not.toBeInTheDocument();
  });

  it("deletes a supplier after confirmation", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const loadSuppliers = vi.fn().mockResolvedValue(structuredClone(rows));
    const deleteSupplier = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <SuppliersPage
          loadSuppliers={loadSuppliers}
          deleteSupplier={deleteSupplier}
        />
      </MemoryRouter>,
    );

    await screen.findByText("A-Mart 浩運食品");
    await user.click(screen.getAllByRole("button", { name: "刪除" })[0]!);

    await waitFor(() => {
      expect(deleteSupplier).toHaveBeenCalledWith("s-1");
    });
    expect(screen.queryByText("A-Mart 浩運食品")).not.toBeInTheDocument();
    expect(screen.getByText("三潤")).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("toggles supplier active status via the switch", async () => {
    const user = userEvent.setup();
    const loadSuppliers = vi.fn().mockResolvedValue(structuredClone(rows));
    const updateSupplier = vi.fn().mockResolvedValue({
      ...rows[0],
      isActive: false,
    });

    render(
      <MemoryRouter>
        <SuppliersPage
          loadSuppliers={loadSuppliers}
          updateSupplier={updateSupplier}
        />
      </MemoryRouter>,
    );

    await screen.findByText("A-Mart 浩運食品");
    const activeSwitch = screen.getByRole("switch", {
      name: "停用供應商「A-Mart 浩運食品」",
    });
    expect(activeSwitch).toHaveAttribute("aria-checked", "true");

    await user.click(activeSwitch);

    await waitFor(() => {
      expect(updateSupplier).toHaveBeenCalledWith("s-1", {
        companyName: "A-Mart 浩運食品",
        contactPerson: "蔡生",
        phoneNumber: "9802 9338",
        deliverySchedule: "星期一",
        paymentSchedule: "日結",
        comment: "可靠",
        isActive: false,
      });
    });
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

  it("paginates suppliers and navigates between pages", async () => {
    const user = userEvent.setup();
    const manyRows: SupplierRow[] = Array.from({ length: 18 }, (_, index) => ({
      id: `s-${index}`,
      companyName: `供應商 ${String(index + 1).padStart(2, "0")}`,
      contactPerson: null,
      phoneNumber: null,
      deliverySchedule: null,
      paymentSchedule: null,
      comment: null,
      isActive: true,
      cateringIngredients: [],
      rawMeatItems: [],
      restaurantIngredients: [],
      createdAt: "2026-08-01T00:00:00.000Z",
    }));
    const loadSuppliers = vi.fn().mockResolvedValue(structuredClone(manyRows));

    render(
      <MemoryRouter>
        <SuppliersPage loadSuppliers={loadSuppliers} />
      </MemoryRouter>,
    );

    // Page 1 shows the first 15 rows and the summary.
    expect(await screen.findByText("供應商 01")).toBeInTheDocument();
    expect(screen.getByText("供應商 15")).toBeInTheDocument();
    expect(screen.queryByText("供應商 16")).not.toBeInTheDocument();
    expect(screen.getByText("顯示 1–15，共 18 筆")).toBeInTheDocument();

    // Go to page 2.
    await user.click(screen.getByRole("button", { name: "下一頁" }));
    expect(await screen.findByText("供應商 16")).toBeInTheDocument();
    expect(screen.getByText("供應商 18")).toBeInTheDocument();
    expect(screen.queryByText("供應商 01")).not.toBeInTheDocument();
    expect(screen.getByText("顯示 16–18，共 18 筆")).toBeInTheDocument();

    // Go back to page 1.
    await user.click(screen.getByRole("button", { name: "上一頁" }));
    expect(await screen.findByText("供應商 01")).toBeInTheDocument();
  });
});
