import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WatiEmailSendLogsPage } from "../src/components/settings/WatiEmailSendLogsPage";

vi.mock("@/auth/use-page-access", () => ({
  useCurrentPageAccess: () => ({
    loading: false,
    error: null,
    canAccess: () => true,
    canManage: () => true,
    canAccessSection: () => true,
  }),
}));

describe("WATI and email send logs", () => {
  it("exposes only successful automatic sends through a permission-scoped RPC", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260901110000_wati_email_send_logs.sql"),
      "utf8",
    );

    expect(migration).toContain("settings.wati_email_logs");
    expect(migration).toContain("private.has_page_access('settings.wati_email_logs')");
    expect(migration).toContain("outbox.wati_sent_at");
    expect(migration).toContain("outbox.email_sent_at");
    expect(migration).toContain("outbox.status = 'sent'");
    expect(migration).toContain("outbox.event_key not in");
    expect(migration).toContain("'bad_weather_notice'");
  });

  it("keeps the settings actions on one horizontally scrollable row on mobile", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/components/settings/wati-email-send-logs.css"),
      "utf8",
    );

    expect(styles).toContain("flex-wrap: nowrap");
    expect(styles).toContain("overflow-x: auto");
    expect(styles).toContain("-webkit-overflow-scrolling: touch");
  });

  it("shows recipient and address while exposing full truncated content on hover", async () => {
    const loadLogs = vi.fn(async () => ({
      total: 1,
      items: [{
        id: "log-1",
        sentAt: "2026-09-01T02:30:00Z",
        channel: "wati" as const,
        eventKey: "delivery_today_reminder",
        templateName: "fcc2_delivery_reminder_v1",
        recipientName: "Chan Tai Man",
        recipientAddress: "+85291234567",
        orderNumber: "R/202609/001",
        detail: { parameters: [{ name: "date", value: "01/09/2026" }] },
      }],
    }));

    render(<WatiEmailSendLogsPage loadLogs={loadLogs} />);

    await waitFor(() => expect(loadLogs).toHaveBeenCalled());
    expect(screen.getByText("Chan Tai Man")).toBeInTheDocument();
    expect(screen.getByText("+85291234567")).toBeInTheDocument();
    expect(screen.getByText("R/202609/001")).toBeInTheDocument();
    const content = await screen.findByTitle(
      /fcc2_delivery_reminder_v1 · date: 01\/09\/2026/,
    );
    expect(content).toHaveClass("wati-email-log-content-summary");
    expect(content).toHaveAttribute("tabindex", "0");
  });

  it("opens the three moved settings in their requested side-panel widths", async () => {
    const loadLogs = vi.fn(async () => ({ total: 0, items: [] }));
    render(<WatiEmailSendLogsPage loadLogs={loadLogs} />);

    await waitFor(() => expect(loadLogs).toHaveBeenCalled());

    const settingsActions = screen.getByLabelText("通知設定快捷操作");
    expect(settingsActions.parentElement).toHaveClass("list-search-actions");
    expect(settingsActions.closest(".orders-toolbar")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "通知控制中心" }));
    const controlsPanel = screen.getByRole("dialog", { name: "通知控制中心" });
    expect(controlsPanel).toHaveClass("side-panel-half");
    await userEvent.click(screen.getByRole("button", { name: "關閉設定側邊欄" }));

    await userEvent.click(screen.getByRole("button", { name: "郵件通知人設定" }));
    const emailPanel = screen.getByRole("dialog", { name: "郵件通知人設定" });
    expect(emailPanel).toHaveClass("side-panel-majority");
    await userEvent.click(screen.getByRole("button", { name: "關閉設定側邊欄" }));

    await userEvent.click(screen.getByRole("button", { name: "WATI 通知人設定" }));
    const watiPanel = screen.getByRole("dialog", { name: "WATI 通知人設定" });
    expect(watiPanel).toHaveClass("side-panel-majority");
    expect(screen.getByRole("button", { name: "加入通知人" })).toBeInTheDocument();
  });
});
