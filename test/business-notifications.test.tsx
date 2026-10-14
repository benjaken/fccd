import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  NotificationSettingsPage,
  parseReminderNumbers,
} from "@/components/settings/NotificationSettingsPage";
import i18n from "@/i18n";
import type { NotificationSettings } from "@/lib/notifications";

const settings: NotificationSettings = {
  quoteDeliveryDays: [7, 3, 0],
  factoryUnsentDays: [7, 3, 1],
  deliveredUnpaidDays: [1, 3, 7, 14],
  deliveryAttentionHours: [24, 4, 1],
  urgentFactoryChangeHours: 24,
  normalChangeMergeMinutes: 5,
};

describe("business notification reminders", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("normalizes configurable reminder number lists", () => {
    expect(parseReminderNumbers("7, 3, 0, 3")).toEqual([7, 3, 0]);
    expect(parseReminderNumbers("24，4 1")).toEqual([24, 4, 1]);
    expect(parseReminderNumbers("7, -1")).toBeNull();
    expect(parseReminderNumbers("tomorrow")).toBeNull();
  });

  it("loads and saves the administrator reminder settings", async () => {
    const saveSettings = vi.fn(async () => {});
    render(
      <NotificationSettingsPage
        loadSettings={vi.fn(async () => settings)}
        saveSettings={saveSettings}
      />,
    );

    const quoteInput = await screen.findByDisplayValue("7, 3, 0");
    expect(document.querySelector(".notification-settings-page .eyebrow svg"))
      .not.toBeInTheDocument();
    await userEvent.clear(quoteInput);
    await userEvent.type(quoteInput, "10, 5, 0");
    await userEvent.click(screen.getByRole("button", { name: /儲存/ }));

    await waitFor(() =>
      expect(saveSettings).toHaveBeenCalledWith({
        ...settings,
        quoteDeliveryDays: [10, 5, 0],
      }),
    );
    expect(screen.queryByText(/提醒設定已儲存/)).not.toBeInTheDocument();
  });

  it("keeps the deduplicated notification model, realtime publication, and reminder jobs in the migration", () => {
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260823210000_business_notifications.sql",
      ),
      "utf8",
    );
    expect(migration).toContain("unique (dedupe_key, recipient_user_id)");
    expect(migration).toContain("alter publication supabase_realtime add table public.business_notifications");
    expect(migration).toContain("fccd-refresh-due-notifications");
    expect(migration).toContain("create or replace function public.acknowledge_factory_change");
    expect(migration).toContain("quote_close_reason = 'delivery_date_passed'");
  });

  it("clears due reminders once their due date or delivery time has passed", () => {
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20261014250000_resolve_past_due_reminders.sql",
      ),
      "utf8",
    );
    expect(migration).toContain("create or replace function public.refresh_due_notifications");
    expect(migration).toContain("(o.delivery_at at time zone 'Asia/Hong_Kong')::date < v_today");
    expect(migration).toContain("d.delivery_at is not null and d.delivery_at < p_now");
    expect(migration).toContain("select public.refresh_due_notifications();");
  });

  it("normalizes every order-related notification to an entity detail route", () => {
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260823234000_notification_order_detail_routes.sql",
      ),
      "utf8",
    );
    expect(migration).toContain("set_business_notification_detail_route");
    expect(migration).toContain("new.route := '/orders/' || v_order_id");
    expect(migration).toContain("new.route := '/quotes/' || new.entity_id");
    expect(migration).toContain("new.entity_type := 'order'");
  });

  it("keeps factory order changes on the factory board instead of the global notification center", () => {
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260824011000_factory_changes_factory_board_only.sql",
      ),
      "utf8",
    );
    const notificationsSource = readFileSync(
      path.resolve(process.cwd(), "src/lib/notifications.ts"),
      "utf8",
    );

    expect(migration).toContain("create or replace function private.register_factory_change");
    expect(migration).toContain("insert into public.factory_change_tasks");
    expect(migration).not.toContain("private.upsert_business_notification");
    expect(migration).toContain("where event_type = 'factory_order_changed'");
    expect(notificationsSource).toContain('.neq("event_type", "factory_order_changed")');
  });

  it("lets authorized factory-board users read change tasks without executing the private role helper", () => {
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260824012000_fix_factory_change_task_read_policy.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("drop policy if exists factory_change_tasks_read");
    expect(migration).toContain("auth.jwt()");
    expect(migration).toContain("'Super Admin', 'Admin', 'Factory'");
    expect(migration).not.toContain("private.jwt_app_role()");
  });

  it("baselines only historical Bubble factory changes", () => {
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260831121000_baseline_bubble_factory_change_state.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("factory_order.legacy_id is not null");
    expect(migration).toContain("set factory_reprint_required = false");
    expect(migration).toContain("change_count = 0");
    expect(migration).toContain("needs_label_reprint = false");
    expect(migration).toContain("line_change.resolved_at is null");
  });

  it("guards no-op notification upserts so realtime stays quiet", () => {
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260924120000_business_notification_realtime_noise.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("create or replace function private.upsert_business_notification");
    expect(migration).toMatch(
      /on conflict \(dedupe_key, recipient_user_id\) do update[\s\S]+where/,
    );
    expect(migration).toContain(
      "public.business_notifications.event_type is distinct from excluded.event_type",
    );
    expect(migration).toContain("public.business_notifications.resolved_at is not null");
  });

  it("coalesces realtime notification reloads instead of polling every minute", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/components/NotificationCenter.tsx"),
      "utf8",
    );

    expect(source).toContain("scheduleReload");
    expect(source).not.toContain("}, 60_000)");
    expect(source).toContain("}, 5 * 60_000)");
  });
});
