import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrderStatusesPage } from "@/components/OrderStatusesPage";
import i18n from "@/i18n";
import {
  filterOrderStatuses,
  parseHexColor,
  type OrderStatusRow,
} from "@/lib/order-statuses";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { app_metadata: { role: "Super Admin" } },
    profile: { role: "Super Admin" },
  }),
}));

const rows: OrderStatusRow[] = [
  {
    id: "st-1",
    name: "已確認",
    color: "#2563eb",
    createdAt: "2024-03-21T00:00:00.000Z",
  },
  {
    id: "st-2",
    name: "製作中",
    color: "#d97706",
    createdAt: "2024-04-02T00:00:00.000Z",
  },
];

describe("parseHexColor", () => {
  it("normalizes 3-digit and 6-digit hex colors", () => {
    expect(parseHexColor("#ABC")).toBe("#aabbcc");
    expect(parseHexColor("FF0000")).toBe("#ff0000");
    expect(parseHexColor("red")).toBeNull();
  });
});

describe("filterOrderStatuses", () => {
  it("filters by name or color", () => {
    expect(
      filterOrderStatuses(rows, { search: "製作" }).map((row) => row.id),
    ).toEqual(["st-2"]);
    expect(
      filterOrderStatuses(rows, { search: "2563" }).map((row) => row.id),
    ).toEqual(["st-1"]);
  });
});

describe("Order status page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("lists statuses and filters from the search bar", async () => {
    const user = userEvent.setup();
    const loadStatuses = vi
      .fn()
      .mockImplementation(async (filters = {}) =>
        filterOrderStatuses(structuredClone(rows), filters),
      );

    render(
      <MemoryRouter>
        <OrderStatusesPage loadStatuses={loadStatuses} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "訂單狀態" }),
    ).toBeInTheDocument();
    expect(screen.getByText("已確認")).toBeInTheDocument();
    expect(screen.getByText("製作中")).toBeInTheDocument();
    expect(screen.getByText("#2563eb")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("搜尋狀態名稱或顏色"), "製作中");
    await user.click(screen.getByRole("button", { name: "搜尋" }));

    await waitFor(() => {
      expect(loadStatuses).toHaveBeenLastCalledWith({ search: "製作中" });
    });

    expect(await screen.findByText("製作中")).toBeInTheDocument();
    expect(screen.queryByText("已確認")).not.toBeInTheDocument();
  });

  it("opens the create panel and adds a status with name and color", async () => {
    const user = userEvent.setup();
    const loadStatuses = vi.fn().mockResolvedValue(structuredClone(rows));
    const createStatus = vi.fn().mockResolvedValue({
      id: "st-3",
      name: "已完成",
      color: "#16a34a",
      createdAt: "2024-05-01T00:00:00.000Z",
    });

    render(
      <MemoryRouter>
        <OrderStatusesPage
          loadStatuses={loadStatuses}
          createStatus={createStatus}
        />
      </MemoryRouter>,
    );

    await screen.findByText("已確認");
    await user.click(screen.getByRole("button", { name: "新建" }));

    await screen.findByRole("dialog", { name: "新增訂單狀態" });
    await user.type(screen.getByPlaceholderText("輸入狀態名稱"), "已完成");
    const colorInput = screen.getByPlaceholderText("例如：#FF0000");
    await user.clear(colorInput);
    await user.type(colorInput, "#16a34a");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(createStatus).toHaveBeenCalledWith({
        name: "已完成",
        color: "#16a34a",
      });
    });

    expect(await screen.findByText("已完成")).toBeInTheDocument();
  });

  it("requires name and a valid color before saving", async () => {
    const user = userEvent.setup();
    const createStatus = vi.fn();

    render(
      <MemoryRouter>
        <OrderStatusesPage
          loadStatuses={vi.fn().mockResolvedValue([])}
          createStatus={createStatus}
        />
      </MemoryRouter>,
    );

    await user.click((await screen.findAllByRole("button", { name: "新建" }))[0]!);
    await screen.findByRole("dialog", { name: "新增訂單狀態" });
    const colorInput = screen.getByPlaceholderText("例如：#FF0000");
    await user.clear(colorInput);
    await user.type(colorInput, "red");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("請輸入名稱")).toBeInTheDocument();
    expect(screen.getByText("請選擇有效顏色")).toBeInTheDocument();
    expect(createStatus).not.toHaveBeenCalled();
  });

  it("opens the edit panel and updates name and color", async () => {
    const user = userEvent.setup();
    const loadStatuses = vi.fn().mockResolvedValue(structuredClone(rows));
    const updateStatus = vi.fn().mockResolvedValue({
      ...rows[0],
      name: "已確認改",
      color: "#dc2626",
    });

    render(
      <MemoryRouter>
        <OrderStatusesPage
          loadStatuses={loadStatuses}
          updateStatus={updateStatus}
        />
      </MemoryRouter>,
    );

    await screen.findByText("已確認");
    await user.click(screen.getAllByRole("button", { name: "編輯" })[0]!);

    await screen.findByRole("dialog", { name: "編輯訂單狀態" });
    const nameInput = screen.getByPlaceholderText("輸入狀態名稱");
    expect(nameInput).toHaveValue("已確認");
    expect(screen.getByPlaceholderText("例如：#FF0000")).toHaveValue("#2563eb");

    await user.clear(nameInput);
    await user.type(nameInput, "已確認改");
    const colorInput = screen.getByPlaceholderText("例如：#FF0000");
    await user.clear(colorInput);
    await user.type(colorInput, "#dc2626");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateStatus).toHaveBeenCalledWith("st-1", {
        name: "已確認改",
        color: "#dc2626",
      });
    });

    expect(await screen.findByText("已確認改")).toBeInTheDocument();
    expect(screen.queryByText("已確認")).not.toBeInTheDocument();
    expect(screen.getByText("製作中")).toBeInTheDocument();
  });

  it("hides create, edit, and delete without action permission", async () => {
    render(
      <MemoryRouter>
        <OrderStatusesPage
          loadStatuses={vi.fn().mockResolvedValue(structuredClone(rows))}
          canCreate={false}
          canEdit={false}
          canDelete={false}
        />
      </MemoryRouter>,
    );

    await screen.findByText("已確認");
    expect(screen.queryByRole("button", { name: "新建" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "編輯" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "刪除" })).not.toBeInTheDocument();
  });
});
