import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationCenter } from "@/components/NotificationCenter";
import i18n from "@/i18n";
import {
  fetchNotifications,
  markNotificationRead,
  refreshDueNotifications,
  snoozeNotification,
  subscribeToNotifications,
} from "@/lib/notifications";

vi.mock("@/lib/notifications", async () => {
  const actual = await vi.importActual<typeof import("@/lib/notifications")>(
    "@/lib/notifications",
  );
  return {
    ...actual,
    fetchNotifications: vi.fn(),
    markNotificationRead: vi.fn(async () => {}),
    refreshDueNotifications: vi.fn(async () => {}),
    resolveNotification: vi.fn(async () => {}),
    snoozeNotification: vi.fn(async () => {}),
    subscribeToNotifications: vi.fn(() => ({ unsubscribe: vi.fn(async () => {}) })),
  };
});

describe("NotificationCenter", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
    vi.mocked(fetchNotifications).mockResolvedValue([
      {
        id: "notice-1",
        eventType: "factory_unsent",
        category: "action",
        priority: "important",
        title: "訂單尚未發送工場",
        body: "B-100 距離送餐日期還有 3 天。",
        entityType: "order",
        entityId: "order-1",
        route: null,
        metadata: { stage: 3 },
        readAt: null,
        snoozedUntil: null,
        createdAt: "2026-08-23T01:00:00.000Z",
        updatedAt: "2026-08-23T01:00:00.000Z",
      },
    ]);
  });

  it("loads the login summary and opens the filterable bell inbox", async () => {
    render(
      <MemoryRouter>
        <NotificationCenter userId="user-1" />
      </MemoryRouter>,
    );

    expect(await screen.findByText("你有 1 項待處理工作")).toBeInTheDocument();
    expect(refreshDueNotifications).toHaveBeenCalled();
    expect(subscribeToNotifications).toHaveBeenCalledWith("user-1", expect.any(Function));

    await userEvent.click(screen.getByRole("button", { name: "通知" }));
    expect(screen.getByRole("dialog", { name: "通知中心" })).toBeInTheDocument();
    expect(screen.getByText("訂單尚未發送工場")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "待處理" })).toBeInTheDocument();
  });

  it("does not show the login summary when there are no action items", async () => {
    vi.mocked(fetchNotifications).mockResolvedValue([
      {
        id: "notice-info-1",
        eventType: "system_information",
        category: "information",
        priority: "normal",
        title: "系統資訊",
        body: null,
        entityType: null,
        entityId: null,
        route: null,
        metadata: {},
        readAt: null,
        snoozedUntil: null,
        createdAt: "2026-08-23T01:00:00.000Z",
        updatedAt: "2026-08-23T01:00:00.000Z",
      },
    ]);

    render(
      <MemoryRouter>
        <NotificationCenter userId="user-1" />
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText("1 則未讀通知")).toBeInTheDocument();
    expect(screen.queryByText("你有 0 項待處理工作")).not.toBeInTheDocument();
  });

  it("supports a one-hour snooze without resolving an action", async () => {
    render(
      <MemoryRouter>
        <NotificationCenter userId="user-1" />
      </MemoryRouter>,
    );
    await screen.findByText("你有 1 項待處理工作");
    await userEvent.click(screen.getByRole("button", { name: "通知" }));
    await userEvent.click(screen.getByRole("button", { name: "1 小時後提醒" }));
    await waitFor(() => expect(snoozeNotification).toHaveBeenCalledWith("notice-1", expect.any(Date)));
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it("opens an order notification in the order detail page", async () => {
    function LocationProbe() {
      return <output data-testid="location">{useLocation().pathname}</output>;
    }

    render(
      <MemoryRouter initialEntries={["/"]}>
        <NotificationCenter userId="user-1" />
        <LocationProbe />
      </MemoryRouter>,
    );

    await screen.findByText("你有 1 項待處理工作");
    await userEvent.click(screen.getByRole("button", { name: "通知" }));
    await userEvent.click(screen.getByText("訂單尚未發送工場"));

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/orders/order-1"),
    );
  });

  it("keeps the drawer fixed while the notification list scrolls internally", () => {
    const stylesheet = readFileSync(
      path.resolve(process.cwd(), "src/components/notification-center.css"),
      "utf8",
    );
    expect(stylesheet).toMatch(/\.notification-side-panel\s*>\s*\.side-panel-body[^}]*overflow:\s*hidden/);
    expect(stylesheet).toMatch(/\.notification-list[^}]*overflow-y:\s*auto/);
    expect(stylesheet).toMatch(/\.notification-list[^}]*overscroll-behavior:\s*contain/);
  });

  it("shows and acknowledges an urgent internal order reconciliation popup", async () => {
    vi.mocked(fetchNotifications).mockResolvedValue([
      {
        id: "urgent-reconciliation-1",
        eventType: "order_reconciliation_urgent",
        category: "action",
        priority: "urgent",
        title: "緊急漏單預警",
        body: "B-1234：尚未傳送廚房",
        entityType: "order",
        entityId: "order-urgent-1",
        route: "/orders/order-urgent-1",
        metadata: { issueId: "issue-1" },
        readAt: null,
        snoozedUntil: null,
        createdAt: "2026-08-31T01:00:00.000Z",
        updatedAt: "2026-08-31T01:00:00.000Z",
      },
    ]);

    render(
      <MemoryRouter>
        <NotificationCenter userId="user-1" />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("dialog", { name: "緊急漏單預警" })).toBeInTheDocument();
    expect(screen.getByText("緊急漏單：1 張訂單仍未解決")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /1 小時/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "我已知悉" }));
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith("urgent-reconciliation-1"));
    expect(screen.getByText("緊急漏單：1 張訂單仍未解決")).toBeInTheDocument();
  });
});
