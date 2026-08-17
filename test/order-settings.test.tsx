import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrderSettingsPage } from "@/components/OrderSettingsPage";
import i18n from "@/i18n";
import type { OrderTag } from "@/lib/order-tags";
import {
  sortShippingMethods,
  type ShippingMethod,
} from "@/lib/shipping-methods";
import {
  sortPaymentMethods,
  type PaymentMethod,
} from "@/lib/payment-methods";

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

const methods: ShippingMethod[] = [
  {
    id: "ship-1",
    name: "車邊交收",
    displayName: "車邊交收",
    displayOrder: 1,
    requiresAddressCheck: true,
    isEditable: false,
    isActive: true,
  },
  {
    id: "ship-2",
    name: "(上門)",
    displayName: "送貨上門",
    displayOrder: 2,
    requiresAddressCheck: true,
    isEditable: false,
    isActive: true,
  },
  {
    id: "ship-3",
    name: "門市自取",
    displayName: "門市自取",
    displayOrder: 3,
    requiresAddressCheck: false,
    isEditable: false,
    isActive: true,
  },
  {
    id: "ship-4",
    name: "品酒室 - 微波爐碟上",
    displayName: "品酒室 - 微波爐碟上",
    displayOrder: 4,
    requiresAddressCheck: false,
    isEditable: false,
    isActive: true,
  },
  {
    id: "ship-5",
    name: "品酒室 - 外賣盒上",
    displayName: "品酒室 - 外賣盒上",
    displayOrder: 5,
    requiresAddressCheck: false,
    isEditable: false,
    isActive: true,
  },
  {
    id: "ship-6",
    name: "寫字樓 - 外賣盒上",
    displayName: "寫字樓 - 外賣盒上",
    displayOrder: 6,
    requiresAddressCheck: false,
    isEditable: true,
    isActive: true,
  },
];

const payments: PaymentMethod[] = [
  {
    id: "pay-1",
    name: "QFpay (Alipay / Wechat Pay)",
    isActive: true,
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "pay-2",
    name: "PayMe",
    isActive: true,
    createdAt: "2024-01-02T00:00:00.000Z",
  },
  {
    id: "pay-3",
    name: "Credit card",
    isActive: true,
    createdAt: "2024-01-03T00:00:00.000Z",
  },
  {
    id: "pay-4",
    name: "FPS",
    isActive: true,
    createdAt: "2024-01-04T00:00:00.000Z",
  },
  {
    id: "pay-5",
    name: "Bank Transfer",
    isActive: true,
    createdAt: "2024-01-05T00:00:00.000Z",
  },
  {
    id: "pay-6",
    name: "Octopus",
    isActive: true,
    createdAt: "2024-01-06T00:00:00.000Z",
  },
  {
    id: "pay-7",
    name: "Wine Passions",
    isActive: true,
    createdAt: "2024-01-07T00:00:00.000Z",
  },
  {
    id: "pay-8",
    name: "Brand Story Asia",
    isActive: true,
    createdAt: "2024-01-08T00:00:00.000Z",
  },
  {
    id: "pay-9",
    name: "Klook",
    isActive: true,
    createdAt: "2024-01-09T00:00:00.000Z",
  },
  {
    id: "pay-10",
    name: "Foodpanda",
    isActive: true,
    createdAt: "2024-01-10T00:00:00.000Z",
  },
  {
    id: "pay-11",
    name: "Cash",
    isActive: true,
    createdAt: "2024-01-11T00:00:00.000Z",
  },
];

function renderSettings(
  tab = "tags",
  props: Partial<Parameters<typeof OrderSettingsPage>[0]> = {},
) {
  const loadTags = props.loadTags ?? vi.fn().mockResolvedValue(structuredClone(tags));
  const loadMethods =
    props.loadMethods ?? vi.fn().mockResolvedValue(structuredClone(methods));
  const loadPaymentMethods =
    props.loadPaymentMethods ??
    vi.fn().mockResolvedValue(structuredClone(payments));
  return {
    loadTags,
    loadMethods,
    loadPaymentMethods,
    ...render(
      <MemoryRouter initialEntries={[`/orders/settings/${tab}`]}>
        <Routes>
          <Route
            path="/orders/settings/:tab"
            element={
              <OrderSettingsPage
                loadTags={loadTags}
                loadMethods={loadMethods}
                loadPaymentMethods={loadPaymentMethods}
                {...props}
              />
            }
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

describe("Order settings shipping methods page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("sorts methods by display order then name", () => {
    expect(
      sortShippingMethods([
        methods[5],
        methods[0],
        { ...methods[1], displayOrder: null },
      ]).map((row) => row.id),
    ).toEqual(["ship-1", "ship-6", "ship-2"]);
  });

  it("lists delivery methods with address and Active toggles", async () => {
    renderSettings("shipping");

    expect(screen.getByRole("link", { name: "送貨方式" })).toHaveAttribute(
      "href",
      "/orders/settings/shipping",
    );
    expect(screen.getByRole("link", { name: "送貨方式" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "添加" })).toBeInTheDocument();
    expect(screen.queryByText("此設定稍後開放")).not.toBeInTheDocument();

    await screen.findByText("車邊交收");
    const table = within(screen.getByRole("table"));
    expect(table.getByText("運送方式")).toBeInTheDocument();
    expect(table.getByText("地址")).toBeInTheDocument();
    expect(table.getByText("Active")).toBeInTheDocument();
    expect(table.getByText("送貨上門")).toBeInTheDocument();
    expect(table.queryByText("(上門)")).not.toBeInTheDocument();
    expect(table.getByText("寫字樓 - 外賣盒上")).toBeInTheDocument();
    expect(table.getByText("1")).toBeInTheDocument();
    expect(table.getByText("6")).toBeInTheDocument();

    expect(
      table.getByRole("switch", { name: "切換 車邊交收 的地址要求" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      table.getByRole("switch", { name: "切換 門市自取 的地址要求" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      table.getByRole("switch", { name: "切換 寫字樓 - 外賣盒上 的啟用狀態" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      table.getByRole("button", { name: "編輯 車邊交收" }),
    ).toBeInTheDocument();
  });

  it("creates a delivery method from the heading action", async () => {
    const user = userEvent.setup();
    const createMethod = vi.fn().mockResolvedValue({
      id: "ship-7",
      name: "新運送方式",
      displayName: "新運送方式",
      displayOrder: 7,
      requiresAddressCheck: false,
      isEditable: true,
      isActive: true,
    });
    renderSettings("shipping", { createMethod });

    await screen.findByText("車邊交收");
    await user.click(screen.getByRole("button", { name: "添加" }));
    const dialog = await screen.findByRole("dialog", { name: "新增送貨方式" });
    await user.type(within(dialog).getByLabelText("名稱"), "新運送方式");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(createMethod).toHaveBeenCalledWith({
        name: "新運送方式",
        requiresAddressCheck: false,
        isActive: true,
      });
    });
    expect(await screen.findByText("新運送方式")).toBeInTheDocument();
  });

  it("toggles address and Active from the table", async () => {
    const user = userEvent.setup();
    const updateMethod = vi
      .fn()
      .mockResolvedValueOnce({
        ...methods[5],
        requiresAddressCheck: true,
      })
      .mockResolvedValueOnce({
        ...methods[5],
        requiresAddressCheck: true,
        isActive: false,
      });
    renderSettings("shipping", { updateMethod });

    const addressToggle = await screen.findByRole("switch", {
      name: "切換 寫字樓 - 外賣盒上 的地址要求",
    });
    await user.click(addressToggle);
    await waitFor(() => {
      expect(updateMethod).toHaveBeenCalledWith("ship-6", {
        requiresAddressCheck: true,
      });
    });

    const activeToggle = screen.getByRole("switch", {
      name: "切換 寫字樓 - 外賣盒上 的啟用狀態",
    });
    await user.click(activeToggle);
    await waitFor(() => {
      expect(updateMethod).toHaveBeenCalledWith("ship-6", {
        isActive: false,
      });
    });
  });

  it("locks the name of system default methods in the edit panel", async () => {
    const user = userEvent.setup();
    const updateMethod = vi.fn().mockResolvedValue({
      ...methods[0],
      isActive: false,
    });
    renderSettings("shipping", { updateMethod });

    await user.click(await screen.findByRole("button", { name: "編輯 車邊交收" }));
    const dialog = await screen.findByRole("dialog", { name: "編輯送貨方式" });
    const nameInput = within(dialog).getByLabelText("名稱");
    expect(nameInput).toBeDisabled();
    expect(nameInput).toHaveValue("車邊交收");
    expect(
      within(dialog).getByText("此運送方式為系統預設，名稱不可修改。"),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByLabelText("Active"));
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(updateMethod).toHaveBeenCalledWith("ship-1", {
        name: undefined,
        requiresAddressCheck: true,
        isActive: false,
      });
    });
  });
});

describe("Order settings payment methods page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("sorts methods by created time then name", () => {
    expect(
      sortPaymentMethods([
        payments[10],
        payments[0],
        { ...payments[1], createdAt: null },
      ]).map((row) => row.id),
    ).toEqual(["pay-1", "pay-11", "pay-2"]);
  });

  it("lists payment methods with Active toggles and edit actions", async () => {
    renderSettings("payments");

    expect(screen.getByRole("link", { name: "付款方式" })).toHaveAttribute(
      "href",
      "/orders/settings/payments",
    );
    expect(screen.getByRole("link", { name: "付款方式" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "添加" })).toBeInTheDocument();
    expect(screen.queryByText("此設定稍後開放")).not.toBeInTheDocument();

    await screen.findByText("QFpay (Alipay / Wechat Pay)");
    const table = within(screen.getByRole("table"));
    expect(table.getByText("付款方式")).toBeInTheDocument();
    expect(table.getByText("Active")).toBeInTheDocument();
    expect(table.getByText("PayMe")).toBeInTheDocument();
    expect(table.getByText("Cash")).toBeInTheDocument();
    expect(table.getByText("Foodpanda")).toBeInTheDocument();
    expect(
      table.getByRole("switch", {
        name: "切換 QFpay (Alipay / Wechat Pay) 的啟用狀態",
      }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      table.getByRole("button", { name: "編輯 PayMe" }),
    ).toBeInTheDocument();
  });

  it("creates a payment method from the heading action", async () => {
    const user = userEvent.setup();
    const createPayment = vi.fn().mockResolvedValue({
      id: "pay-12",
      name: "Visa",
      isActive: true,
      createdAt: "2024-01-12T00:00:00.000Z",
    });
    renderSettings("payments", { createPayment });

    await screen.findByText("PayMe");
    await user.click(screen.getByRole("button", { name: "添加" }));
    const dialog = await screen.findByRole("dialog", { name: "新增付款方式" });
    await user.type(within(dialog).getByLabelText("名稱"), "Visa");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(createPayment).toHaveBeenCalledWith({
        name: "Visa",
        isActive: true,
      });
    });
    expect(await screen.findByText("Visa")).toBeInTheDocument();
  });

  it("toggles Active and edits a payment method", async () => {
    const user = userEvent.setup();
    const updatePayment = vi
      .fn()
      .mockResolvedValueOnce({
        ...payments[1],
        isActive: false,
      })
      .mockResolvedValueOnce({
        ...payments[1],
        name: "PayMe HK",
        isActive: false,
      });
    renderSettings("payments", { updatePayment });

    const toggle = await screen.findByRole("switch", {
      name: "切換 PayMe 的啟用狀態",
    });
    await user.click(toggle);
    await waitFor(() => {
      expect(updatePayment).toHaveBeenCalledWith("pay-2", { isActive: false });
    });

    await user.click(screen.getByRole("button", { name: "編輯 PayMe" }));
    const dialog = await screen.findByRole("dialog", { name: "編輯付款方式" });
    const nameInput = within(dialog).getByLabelText("名稱");
    expect(nameInput).toBeEnabled();
    expect(nameInput).toHaveValue("PayMe");
    await user.clear(nameInput);
    await user.type(nameInput, "PayMe HK");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(updatePayment).toHaveBeenCalledWith("pay-2", {
        name: "PayMe HK",
        isActive: false,
      });
    });
    expect(await screen.findByText("PayMe HK")).toBeInTheDocument();
  });
});
