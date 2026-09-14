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
      { userId: "user-1", userName: "Bis", email: "bis@example.com", enabled: true, additionalEmails: [] },
      { userId: "user-2", userName: "Packing", email: "packing@example.com", enabled: false, additionalEmails: [] },
    ]);
    const setUserEnabled = vi.fn().mockResolvedValue({
      userId: "user-2",
      userName: "Packing",
      email: "packing@example.com",
      enabled: true,
      additionalEmails: [],
    });

    renderSettings("email-notifications", {
      loadEmailNotificationUsers: loadUsers,
      setEmailNotificationUser: setUserEnabled,
    });

    expect(await screen.findByRole("heading", { name: "郵件通知人設定" })).toBeInTheDocument();
    expect(await screen.findByText("packing@example.com")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "切換 Packing 的電郵通知" }));

    await waitFor(() => expect(setUserEnabled).toHaveBeenCalledWith("user-2", true));
  });

  it("adds and removes additional notification emails for one user", async () => {
    const loadUsers = vi.fn().mockResolvedValue([{
      userId: "elena-id",
      userName: "Elena",
      email: "chifung.login@gmail.com",
      enabled: true,
      additionalEmails: [{ id: "address-1", email: "old@example.com" }],
    }]);
    const saveAddress = vi.fn().mockResolvedValue({
      id: "address-2",
      email: "chifung.plan@gmail.com",
    });
    const deleteAddress = vi.fn().mockResolvedValue(undefined);

    renderSettings("email-notifications", {
      loadEmailNotificationUsers: loadUsers,
      setEmailNotificationUser: vi.fn(),
      saveEmailNotificationAddress: saveAddress,
      deleteEmailNotificationAddress: deleteAddress,
    });

    expect(await screen.findByText("chifung.login@gmail.com")).toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText("Elena 的附加通知郵箱"),
      "chifung.plan@gmail.com",
    );
    await userEvent.click(screen.getByRole("button", { name: "加入郵箱" }));
    await waitFor(() => expect(saveAddress).toHaveBeenCalledWith(
      "elena-id",
      "chifung.plan@gmail.com",
    ));
    expect(await screen.findByText("chifung.plan@gmail.com")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "刪除 old@example.com" }));
    await waitFor(() => expect(deleteAddress).toHaveBeenCalledWith("address-1"));
  });

  it("loads and updates independent WATI controls", async () => {
    const loadControls = vi.fn().mockResolvedValue({
      automaticNotificationsEnabled: true,
      automaticEmailNotificationsEnabled: true,
      manualOrderConfirmationEnabled: false,
      manualOrderConfirmationEmailEnabled: false,
      manualQuoteConfirmationEnabled: false,
      manualQuoteConfirmationEmailEnabled: false,
      updatedAt: "2026-08-31T06:00:00.000Z",
    });
    const setControl = vi.fn().mockResolvedValue({
      automaticNotificationsEnabled: true,
      automaticEmailNotificationsEnabled: true,
      manualOrderConfirmationEnabled: true,
      manualOrderConfirmationEmailEnabled: false,
      manualQuoteConfirmationEnabled: false,
      manualQuoteConfirmationEmailEnabled: false,
      updatedAt: "2026-08-31T06:01:00.000Z",
    });
    const setDeliveryControl = vi.fn().mockResolvedValue({
      automaticNotificationsEnabled: true,
      automaticEmailNotificationsEnabled: true,
      manualOrderConfirmationEnabled: true,
      manualOrderConfirmationEmailEnabled: false,
      updatedAt: "2026-08-31T06:01:00.000Z",
    });

    renderSettings("wati-notifications", {
      loadWatiNotificationControls: loadControls,
      setWatiNotificationControl: setControl,
      setWatiNotificationDeliveryControl: setDeliveryControl,
    });

    expect(await screen.findByRole("heading", { name: "WATI 通知" }))
      .toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "切換自動 WATI 通知" }))
      .toBeChecked();
    expect(screen.queryByRole("switch", { name: "切換手動報價確認 WATI" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "切換手動報價確認電郵" }))
      .not.toBeInTheDocument();
    expect(screen.getByText("WATI 7 / 8")).toBeInTheDocument();
    expect(screen.getByText("Email 9 / 10")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", {
      name: "切換 手動訂單確認 的 WATI 通知",
    }));
    await waitFor(() =>
      expect(setDeliveryControl).toHaveBeenCalledWith(
        "manual_order_confirmation",
        "wati",
        true,
      ),
    );
  });

  it("saves the notification recipient allowlist mode", async () => {
    const controls = {
      automaticNotificationsEnabled: true,
      automaticEmailNotificationsEnabled: true,
      manualOrderConfirmationEnabled: true,
      manualOrderConfirmationEmailEnabled: true,
      recipientMode: "environment" as const,
      allowedWatiPhones: ["8613828747224"],
      allowedEmails: ["cfb.app02@chifung.net"],
      eventControls: {},
      templateStates: {},
      updatedAt: "2026-09-14T06:00:00.000Z",
    };
    const savePolicy = vi.fn().mockResolvedValue({
      ...controls,
      recipientMode: "allowlist" as const,
    });

    renderSettings("wati-notifications", {
      loadWatiNotificationControls: vi.fn().mockResolvedValue(controls),
      saveWatiNotificationRecipientPolicy: savePolicy,
    });

    await screen.findByText("收件人安全模式");
    await userEvent.click(screen.getByRole("radio", { name: /^白名單/ }));
    await userEvent.click(screen.getByRole("button", { name: "儲存收件人模式" }));

    await waitFor(() => expect(savePolicy).toHaveBeenCalledWith({
      mode: "allowlist",
      allowedWatiPhones: ["8613828747224"],
      allowedEmails: ["cfb.app02@chifung.net"],
    }));
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

  it("registers notification tabs, exact permissions, and protected database RPCs", () => {
    expect(isOrderSettingsTab("wati-notifications")).toBe(true);
    expect(isOrderSettingsTab("email-notifications")).toBe(true);
    expect(isOrderSettingsTab("first-notification-recipients")).toBe(true);
    expect(pageAccessKey("/orders/settings/email-notifications"))
      .toBe("orders.settings.email_notifications");
    expect(pageAccessKey("/orders/settings/first-notification-recipients"))
      .toBe("orders.settings.first_notification_recipients");
    expect(pageAccessKey("/orders/settings/wati-notifications"))
      .toBe("orders.settings.wati_notifications");

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

    const multiEmailSql = readFileSync(join(
      process.cwd(),
      "supabase/migrations/20260831150000_order_notification_multi_email.sql",
    ), "utf8");
    expect(multiEmailSql).toContain("create table if not exists public.order_email_notification_addresses");
    expect(multiEmailSql).toContain("private.order_email_notification_recipients()");
    expect(multiEmailSql).toContain("save_order_email_notification_address");

    const loginFilterSql = readFileSync(join(
      process.cwd(),
      "supabase/migrations/20260831152000_filter_email_notifications_to_login_users.sql",
    ), "utf8");
    expect(loginFilterSql).toContain("join auth.users auth_user");
    expect(loginFilterSql).toContain("profile.login_enabled");
    expect(loginFilterSql).toContain("auth_user.banned_until is null");

    const watiSql = readFileSync(join(
      process.cwd(),
      "supabase/migrations/20260831140000_wati_notification_controls.sql",
    ), "utf8");
    expect(watiSql).toContain("create table if not exists public.wati_notification_controls");
    expect(watiSql).toContain("private.has_page_manage('orders.settings.wati_notifications')");
    expect(watiSql).toContain("manual_order_confirmation_enabled");
  });
});
