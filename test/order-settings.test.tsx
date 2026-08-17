import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrderSettingsPage } from "@/components/OrderSettingsPage";
import i18n from "@/i18n";
import type { OrderTag } from "@/lib/order-tags";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { app_metadata: { role: "Super Admin" } },
    profile: { role: "Super Admin" },
  }),
}));

const tags: OrderTag[] = [
  { id: "tag-1", name: "家人食飯", isActive: true },
  { id: "tag-2", name: "Klook", isActive: true },
  { id: "tag-3", name: "CNY套餐", isActive: false },
];

function renderSettings(
  tab = "tags",
  props: Partial<Parameters<typeof OrderSettingsPage>[0]> = {},
) {
  const loadTags = props.loadTags ?? vi.fn().mockResolvedValue(structuredClone(tags));
  return {
    loadTags,
    ...render(
      <MemoryRouter initialEntries={[`/orders/settings/${tab}`]}>
        <Routes>
          <Route
            path="/orders/settings/:tab"
            element={<OrderSettingsPage loadTags={loadTags} {...props} />}
          />
        </Routes>
      </MemoryRouter>,
    ),
  };
}

describe("Order settings tags page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("lists migrated order tags with Active toggles", async () => {
    renderSettings();

    expect(await screen.findByRole("heading", { name: "設定" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "訂單設定分類" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "訂單標籤" })).toHaveAttribute(
      "href",
      "/orders/settings/tags",
    );

    const table = within(await screen.findByRole("table"));
    expect(table.getByText("訂單標籤")).toBeInTheDocument();
    expect(table.getByText("Active")).toBeInTheDocument();
    expect(table.getByText("家人食飯")).toBeInTheDocument();
    expect(table.getByText("Klook")).toBeInTheDocument();
    expect(table.getByText("CNY套餐")).toBeInTheDocument();
    expect(
      table.getByRole("switch", { name: "切換 家人食飯 的啟用狀態" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      table.getByRole("switch", { name: "切換 CNY套餐 的啟用狀態" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("creates a tag from the heading action", async () => {
    const user = userEvent.setup();
    const createTag = vi.fn().mockResolvedValue({
      id: "tag-4",
      name: "商業活動",
      isActive: true,
    });
    renderSettings("tags", { createTag });

    await screen.findByText("家人食飯");
    await user.click(screen.getByRole("button", { name: "新增" }));
    const dialog = await screen.findByRole("dialog", { name: "新增訂單標籤" });
    await user.type(within(dialog).getByLabelText("訂單標籤"), "商業活動");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(createTag).toHaveBeenCalledWith("商業活動");
    });
    expect(await screen.findByText("商業活動")).toBeInTheDocument();
  });

  it("toggles Active and archives a tag", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const setTagActive = vi.fn().mockResolvedValue({
      id: "tag-1",
      name: "家人食飯",
      isActive: false,
    });
    const deleteTag = vi.fn().mockResolvedValue(undefined);
    renderSettings("tags", { setTagActive, deleteTag });

    const toggle = await screen.findByRole("switch", {
      name: "切換 家人食飯 的啟用狀態",
    });
    await user.click(toggle);
    await waitFor(() => {
      expect(setTagActive).toHaveBeenCalledWith("tag-1", false);
    });

    await user.click(screen.getByRole("button", { name: "刪除 家人食飯" }));
    await waitFor(() => {
      expect(deleteTag).toHaveBeenCalledWith("tag-1");
    });
    expect(screen.queryByText("家人食飯")).not.toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("shows coming soon for other settings tabs", async () => {
    renderSettings("statuses");

    expect(
      await screen.findByText("此設定稍後開放"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "訂單狀態" })).toHaveClass("active");
  });
});
