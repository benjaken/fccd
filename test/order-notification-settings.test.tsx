import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { pageAccessKey } from "@/auth/use-page-access";
import { OrderSettingsPage } from "@/components/OrderSettingsPage";
import { isOrderSettingsTab } from "@/components/OrderSettingsTabNav";
import i18n from "@/i18n";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { app_metadata: { role: "Super Admin" } },
    profile: { role: "Super Admin" },
  }),
}));

vi.mock("@/auth/use-page-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/auth/use-page-access")>()),
  useCurrentPageAccess: () => ({
    loading: false,
    error: null,
    canAccess: () => true,
    canManage: () => true,
    canAccessSection: () => true,
  }),
}));

function renderSettings(tab: string, props: React.ComponentProps<typeof OrderSettingsPage>) {
  return render(
    <MemoryRouter initialEntries={[`/orders/settings/${tab}`]}>
      <Routes>
        <Route path="/orders/settings/:tab" element={<OrderSettingsPage {...props} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("order notification settings", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("lists users and persists an email notification toggle", async () => {
    const loadUsers = vi.fn().mockResolvedValue([
      { userId: "user-1", userName: "Bis", email: "bis@example.com", enabled: true },
      { userId: "user-2", userName: "Packing", email: "packing@example.com", enabled: false },
    ]);
    const setUserEnabled = vi.fn().mockResolvedValue({
      userId: "user-2",
      userName: "Packing",
      email: "packing@example.com",
      enabled: true,
    });

    renderSettings("email-notifications", {
      loadEmailNotificationUsers: loadUsers,
      setEmailNotificationUser: setUserEnabled,
    });

    expect(await screen.findByRole("heading", { name: "電郵通知" })).toBeInTheDocument();
    expect(await screen.findByText("packing@example.com")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "切換 Packing 的電郵通知" }));

    await waitFor(() => expect(setUserEnabled).toHaveBeenCalledWith("user-2", true));
  });

  it("adds a first order recipient with a phone and delay", async () => {
    const loadRecipients = vi.fn().mockResolvedValue([
      { id: "recipient-1", name: "Bis", phone: "59335469", delayHours: 12 },
    ]);
    const saveRecipient = vi.fn().mockImplementation(async (input) => ({
      id: "recipient-2",
      name: input.name,
      phone: input.phone,
      delayHours: input.delayHours,
    }));

    renderSettings("first-notification-recipients", {
      loadFirstNotificationRecipients: loadRecipients,
      saveFirstNotificationRecipient: saveRecipient,
      deleteFirstNotificationRecipient: vi.fn(),
    });

    expect(await screen.findByText("59335469")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "添加" }));
    await userEvent.type(screen.getByLabelText("名稱"), "Yoko");
    await userEvent.type(screen.getByLabelText("電話"), "61592310");
    await userEvent.clear(screen.getByLabelText("創建訂單後多少小時通知"));
    await userEvent.type(screen.getByLabelText("創建訂單後多少小時通知"), "6");
    await userEvent.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(saveRecipient).toHaveBeenCalledWith({
      id: undefined,
      name: "Yoko",
      phone: "61592310",
      delayHours: 6,
    }));
    expect(await screen.findByText("61592310")).toBeInTheDocument();
  });

  it("registers both tabs, exact permissions, and protected database RPCs", () => {
    expect(isOrderSettingsTab("email-notifications")).toBe(true);
    expect(isOrderSettingsTab("first-notification-recipients")).toBe(true);
    expect(pageAccessKey("/orders/settings/email-notifications"))
      .toBe("orders.settings.email_notifications");
    expect(pageAccessKey("/orders/settings/first-notification-recipients"))
      .toBe("orders.settings.first_notification_recipients");

    const sql = readFileSync(join(
      process.cwd(),
      "supabase/migrations/20260828143000_order_notification_settings.sql",
    ), "utf8");
    expect(sql).toContain("create table public.order_first_notification_recipients");
    expect(sql).toContain("phone text not null");
    expect(sql).toContain("private.has_page_manage('orders.settings.email_notifications')");
    expect(sql).toContain("security definer");
    expect(sql).toContain("grant execute on function public.save_order_first_notification_recipient");
    expect(sql).toContain("create table public.order_internal_notification_outbox");
    expect(sql).toContain("create trigger enqueue_internal_order_notifications");
  });
});
