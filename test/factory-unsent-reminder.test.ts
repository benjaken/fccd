import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { factoryUnsentReminderTiming } from "../supabase/functions/_shared/factory-unsent-reminder.ts";

describe("factory-unsent reminder timing", () => {
  const deliveryStart = new Date("2026-09-30T04:00:00Z");

  it("becomes due at 17:00 Hong Kong time on the day before delivery", () => {
    const before = factoryUnsentReminderTiming(
      deliveryStart,
      new Date("2026-09-29T08:59:59Z"),
    );
    const due = factoryUnsentReminderTiming(
      deliveryStart,
      new Date("2026-09-29T09:00:00Z"),
    );

    expect(before).toMatchObject({ deliveryIsTomorrow: true, isDue: false });
    expect(before?.reminderAt.toISOString()).toBe("2026-09-29T09:00:00.000Z");
    expect(due).toMatchObject({ deliveryIsTomorrow: true, isDue: true });
  });

  it("distinguishes future reminders from expired delivery dates", () => {
    const future = factoryUnsentReminderTiming(
      new Date("2026-10-01T04:00:00Z"),
      new Date("2026-09-29T09:00:00Z"),
    );
    const expired = factoryUnsentReminderTiming(
      new Date("2026-09-29T04:00:00Z"),
      new Date("2026-09-29T09:00:00Z"),
    );

    expect(future).toMatchObject({ deliveryIsTomorrow: false, isDue: false });
    expect(expired).toMatchObject({ deliveryIsTomorrow: false, isDue: true });
  });

  it("preserves cancellation, recipient, and security guards in the migration", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260929103000_factory_unsent_reminder_day_before_17h.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("or private.wati_order_is_cancelled(new)");
    expect(migration).toContain("and not private.wati_order_is_cancelled(orders)");
    expect(migration).toContain("from private.order_email_notification_recipients() as recipient");
    expect(migration).toContain("set search_path = public, private, pg_temp");
  });
});
