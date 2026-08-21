import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrderSettingsPage } from "@/components/OrderSettingsPage";
import i18n from "@/i18n";
import type { ShippingFee } from "@/lib/shipping-fees";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { app_metadata: { role: "Super Admin" } },
    profile: { role: "Super Admin" },
  }),
}));

const fee = (index: number): ShippingFee => ({
  id: `fee-${index}`,
  item: `運費項 ${index}`,
  fee: index * 10,
  createdAt: `2026-08-${String(index).padStart(2, "0")}T00:00:00.000Z`,
});

function renderFees(
  props: Partial<Parameters<typeof OrderSettingsPage>[0]> = {},
) {
  const loadFees =
    props.loadFees ??
    vi.fn(async (page: number) => ({
      rows: page === 1 ? Array.from({ length: 15 }, (_, index) => fee(index + 1)) : [fee(16)],
      total: 16,
    }));
  return {
    loadFees,
    ...render(
      <MemoryRouter initialEntries={["/orders/settings/shipping-fees"]}>
        <Routes>
          <Route
            path="/orders/settings/:tab"
            element={<OrderSettingsPage loadFees={loadFees} {...props} />}
          />
        </Routes>
      </MemoryRouter>,
    ),
  };
}

describe("Order shipping fees settings", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("shows the requested columns and paginates 15 rows at a time", async () => {
    const user = userEvent.setup();
    const { loadFees } = renderFees();

    expect(await screen.findByRole("heading", { name: "運費管理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建" })).toBeInTheDocument();
    const table = within(screen.getByRole("table"));
    expect(table.getByRole("columnheader", { name: "運費項" })).toBeInTheDocument();
    expect(table.getByRole("columnheader", { name: "運費" })).toBeInTheDocument();
    expect(table.getByRole("columnheader", { name: "編輯" })).toBeInTheDocument();
    expect(table.getByRole("columnheader", { name: "刪除" })).toBeInTheDocument();
    expect(table.getAllByRole("row")).toHaveLength(16);
    expect(screen.getByText("顯示 1–15，共 16 筆")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一頁" }));
    await waitFor(() => expect(loadFees).toHaveBeenLastCalledWith(2, 15));
    expect(await screen.findByText("運費項 16")).toBeInTheDocument();
    expect(screen.getByText("顯示 16–16，共 16 筆")).toBeInTheDocument();
  });

  it("creates, edits, and deletes a shipping fee", async () => {
    const user = userEvent.setup();
    const loadFees = vi.fn().mockResolvedValue({ rows: [fee(1)], total: 1 });
    const createFee = vi.fn().mockResolvedValue(fee(2));
    const updateFee = vi.fn().mockResolvedValue({ ...fee(1), item: "新界地面交收", fee: 88 });
    const deleteFee = vi.fn().mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderFees({ loadFees, createFee, updateFee, deleteFee });

    await screen.findByText("運費項 1");
    await user.click(screen.getByRole("button", { name: "新建" }));
    let dialog = await screen.findByRole("dialog", { name: "新建運費" });
    await user.type(within(dialog).getByLabelText("運費項"), "新界地面交收");
    await user.type(within(dialog).getByLabelText("運費"), "88");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(createFee).toHaveBeenCalledWith({ item: "新界地面交收", fee: 88 }),
    );

    await user.click(screen.getByRole("button", { name: "編輯 運費項 1" }));
    dialog = await screen.findByRole("dialog", { name: "編輯運費" });
    const itemInput = within(dialog).getByLabelText("運費項");
    await user.clear(itemInput);
    await user.type(itemInput, "新界地面交收");
    const feeInput = within(dialog).getByLabelText("運費");
    await user.clear(feeInput);
    await user.type(feeInput, "88");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(updateFee).toHaveBeenCalledWith("fee-1", {
        item: "新界地面交收",
        fee: 88,
      }),
    );

    await user.click(screen.getByRole("button", { name: "刪除 運費項 1" }));
    await waitFor(() => expect(deleteFee).toHaveBeenCalledWith("fee-1"));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
