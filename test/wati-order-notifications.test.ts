import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildInternalOrderNotificationContent,
  buildOrderNotificationContent,
  buildQuoteConfirmationContent,
  type OrderNotificationValues,
} from "../supabase/functions/_shared/order-notification-content.ts";

const values: OrderNotificationValues = {
  name: "陳先生",
  order_number: "R/202608/88",
  date: "28/08/2026",
  time: "12:00 - 13:00",
  address: "九龍測試地址",
  delivery_method: "送貨上門",
  ao_deadline: "26/08/2026",
  ao_link: "https://example.com/add-ons",
  shop_name: "Food Channels Catering",
};

describe("WATI order notifications", () => {
  it("renders the internal new-order email from the same order snapshot", () => {
    const notification = buildInternalOrderNotificationContent({
      recipient_name: "Bis",
      order_number: "R/202608/88",
      customer_name: "陳先生",
      created_at: "28/08/2026 10:30",
      delivery_date: "30/08/2026",
      delivery_time: "12:00 - 13:00",
      address: "九龍測試地址",
      order_link: "https://admin.example.com/orders/R%2F202608%2F88",
    });

    expect(notification.subject).toContain("R/202608/88");
    expect(notification.text).toContain("Bis：");
    expect(notification.text).toContain("客戶：陳先生");
    expect(notification.html).toContain("https://admin.example.com/orders/");
  });

  it("keeps customer email copy aligned with the delivery confirmation parameters", () => {
    const notification = buildOrderNotificationContent("delivery_order_confirmed", values);

    expect(notification.subject).toContain(values.order_number);
    expect(notification.text).toContain(`Hello ${values.name},`);
    expect(notification.text).toContain(`日期：${values.date}`);
    expect(notification.text).toContain(`時間：${values.time}`);
    expect(notification.text).toContain(`地址：${values.address}`);
    expect(notification.text).toContain(values.ao_link);
    expect(notification.html).toContain("Food Channels Catering");
  });

  it("uses the supplied pickup wording and fixed pickup address", () => {
    const confirmation = buildOrderNotificationContent("pickup_order_confirmed", values);
    const reminder = buildOrderNotificationContent("pickup_today_reminder", values);

    expect(confirmation.text).toContain("收到你的到會訂單");
    expect(reminder.text).toContain("荃灣青山公路459-469號華力工業中心5樓R室");
    expect(reminder.text).toContain("將於今日備妥");
  });

  it("uses one quote content builder for the email that mirrors WATI data", () => {
    const quote = buildQuoteConfirmationContent({
      name: values.name,
      quoteNumber: "Q-1001",
      pdfUrl: "https://example.com/quote.pdf",
    });

    expect(quote.text).toContain("Q-1001");
    expect(quote.text).toContain("https://example.com/quote.pdf");
    expect(quote.html).toContain("Hello 陳先生,");
  });

  it("seeds no payment or outstanding-balance notification", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260827183000_wati_order_notifications.sql"),
      "utf8",
    );

    expect(migration).not.toMatch(/payment_reminder|outstanding_reminder|尚欠款項/);
    expect(migration).toContain("unique (order_id, template_id, occurrence_key)");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("wati_sent_at timestamptz");
    expect(migration).toContain("email_sent_at timestamptz");
  });

  it("keeps templates disabled until WATI approval", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260827183000_wati_order_notifications.sql"),
      "utf8",
    );

    expect(migration).toContain("is_active boolean not null default false");
    expect(migration).toContain("delivery_today_reminder");
    expect(migration).toContain("pickup_ready");
    expect(migration).toContain("order_cancelled");
  });

  it("uses the approved WATI Utility template for delivery confirmations", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260828120000_use_approved_wati_delivery_confirmation_template.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("order_confirm_with_action_and_aolink");
    expect(migration).toContain("Confirmed Delivery message");
    expect(migration).toContain("where event_key = 'delivery_order_confirmed'");
    expect(migration).toContain('{"name":"ao_deadline","source":"ao_deadline"}');
    expect(migration).toContain('{"name":"ao_link","source":"ao_link"}');
  });

  it("registers existing Utility events without activating unverified mappings", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260828132000_add_existing_wati_utility_events.sql",
      ),
      "utf8",
    );

    for (const template of [
      "driver_assign_reminder",
      "fc_bad_weather_reply_3",
      "fc_holiday_notice",
      "second_contact_person",
      "fcr_new_payment",
      "fcr_confirmation_paid",
      "late_delivery_reply",
      "fck_cny_wrong_order",
    ]) {
      expect(migration).toContain(template);
    }
    expect(migration).toContain("'[]'::jsonb, false");
    expect(migration).toContain("enqueue_manual_wati_order_event");
    expect(migration).toContain("to service_role");
  });

  it("renders fallback email content for every added Utility event", () => {
    for (const event of [
      "driver_assigned",
      "bad_weather_notice",
      "holiday_service_notice",
      "second_contact_requested",
      "payment_instructions_sent",
      "payment_confirmed",
      "delivery_delayed",
      "order_issue_reported",
    ] as const) {
      const notification = buildOrderNotificationContent(event, values);
      expect(notification.subject).toContain(values.order_number);
      expect(notification.text).toContain(values.order_number);
      expect(notification.html).toContain(values.order_number);
    }
  });

  it("queues enabled internal email users and delayed WhatsApp recipients", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260828143000_order_notification_settings.sql",
      ),
      "utf8",
    );
    const worker = readFileSync(
      resolve(process.cwd(), "supabase/functions/wati-order-notifications/index.ts"),
      "utf8",
    );

    expect(migration).toContain("create table public.order_internal_notification_outbox");
    expect(migration).toContain("where profile.email_noti");
    expect(migration).toContain("recipient.delay_hours * interval '1 hour'");
    expect(migration).toContain("unique (order_id, channel, recipient_key)");
    expect(migration).toContain("for update skip locked");
    expect(worker).toContain('"claim_order_internal_notifications"');
    expect(worker).toContain('Deno.env.get("WATI_INTERNAL_ORDER_TEMPLATE_NAME")');
    expect(worker).toContain("buildInternalOrderNotificationContent(values)");
    expect(worker).toContain('Deno.env.get("DAILY_SALES_EMAIL_FROM")');

    const scheduler = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260828143100_schedule_order_internal_notifications.sql",
      ),
      "utf8",
    );
    expect(scheduler).toContain("fccd-order-internal-notifications");
    expect(scheduler).toContain("wati_order_cron_secret");
  });
});
