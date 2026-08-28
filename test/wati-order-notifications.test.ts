import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFactoryUnsentReminderContent,
  buildOrderNotificationContent,
  buildQuoteConfirmationContent,
  buildUnassignedDriverReminderContent,
  supportsOrderEmailNotification,
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
  it("renders the factory-unsent internal reminder with the order link", () => {
    const notification = buildFactoryUnsentReminderContent({
      recipient_name: "Bis",
      order_number: "R/202608/88",
      customer_name: "陳先生",
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
    expect(notification.html).toContain('role="presentation"');
    expect(notification.html).toContain("fc-catering-logo-email.png");
    expect(notification.html).toContain("https://wa.me/85253964335");
    expect(notification.html).toContain("(+852) 2185 7373");
    expect(notification.html).toContain("sales@foodchannels-catering.com");
    expect(notification.html).toContain(`href="${values.ao_link}"`);
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

  it("lists every unassigned delivery order with its FCCD link", () => {
    const reminder = buildUnassignedDriverReminderContent({
      date: "28/08/2026",
      orders: [
        {
          order_number: "R/202608/88",
          customer_name: "Customer A",
          delivery_time: "12:00 - 13:00",
          order_link: "https://admin.example.com/orders/order-a",
        },
        {
          order_number: "R/202608/89",
          customer_name: "Customer B",
          delivery_time: "13:00 - 14:00",
          order_link: "https://admin.example.com/orders/order-b",
        },
      ],
    });

    expect(reminder.subject).toContain("2 張");
    expect(reminder.text).toContain("今日 28/08/2026 有 2 張送貨訂單尚未安排司機");
    expect(reminder.html).toContain("https://admin.example.com/orders/order-a");
    expect(reminder.html).toContain("https://admin.example.com/orders/order-b");
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

  it("does not claim or send notifications before the Monday activation gate", () => {
    const worker = readFileSync(
      resolve(process.cwd(), "supabase/functions/wati-order-notifications/index.ts"),
      "utf8",
    );

    expect(worker).toContain('defaultActivationAt = "2026-08-31T00:00:00+08:00"');
    expect(worker).toContain('Deno.env.get("WATI_NOTIFICATIONS_ACTIVATE_AT")');
    expect(worker.indexOf("Date.now() < activation.timestamp"))
      .toBeLessThan(worker.indexOf('admin.rpc("enqueue_due_wati_order_reminders"'));
    expect(worker).toContain("processed: 0");
    expect(worker).toContain("sent: 0");
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
    expect(migration).toContain("selfpick_order_confirmation_with_action2026");
    expect(migration).toContain("fcc2_delivery_reminder");
    expect(migration).toContain("fcc2_selfpick_reminder");
    expect(migration).toContain("is_active = event_key in");
  });

  it("sends the explicit order confirmation through WATI and email together", () => {
    const implementation = readFileSync(
      resolve(process.cwd(), "supabase/functions/send-order-wati-confirmation/index.ts"),
      "utf8",
    );

    expect(implementation).toContain("buildOrderNotificationContent");
    expect(implementation).toContain('fetch("https://api.resend.com/emails"');
    expect(implementation).toContain("await Promise.allSettled([");
    expect(implementation).toContain("watiSent: true, emailSent: true");
    expect(implementation).toContain("from: EMAIL_FROM");
  });

  it("starts quote WATI and Resend confirmation sends together", () => {
    const implementation = readFileSync(
      resolve(process.cwd(), "supabase/functions/send-quote-confirmation/index.ts"),
      "utf8",
    );

    expect(implementation).toContain("await Promise.allSettled([");
    expect(implementation).toContain("wati_and_email_send_failed");
    expect(implementation).toContain("watiSent: true, emailSent: true");
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

  it("provides matching email content for the restored customer events", () => {
    for (const event of [
      "delivery_tomorrow_reminder",
      "pickup_tomorrow_reminder",
      "pickup_ready",
      "order_completed",
      "order_cancelled",
      "driver_assigned",
    ] as const) {
      expect(supportsOrderEmailNotification(event)).toBe(true);
      const notification = buildOrderNotificationContent(event, values);
      expect(notification.subject).toContain(values.order_number);
      expect(notification.html).toContain(values.order_number);
    }
  });

  it("queues email and WATI factory-unsent reminders for internal recipients", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260828152000_factory_unsent_internal_reminders.sql",
      ),
      "utf8",
    );
    const worker = readFileSync(
      resolve(process.cwd(), "supabase/functions/wati-order-notifications/index.ts"),
      "utf8",
    );

    expect(migration).toContain("create or replace function private.enqueue_internal_order_notifications");
    expect(migration).toContain("where profile.email_noti");
    expect(migration).toContain("order_first_notification_recipients");
    expect(migration).toContain("is_sent_to_factory");
    expect(migration).toContain("do_not_send_to_factory");
    expect(worker).toContain('"claim_order_internal_notifications"');
    expect(worker).toContain('Deno.env.get("WATI_FACTORY_UNSENT_TEMPLATE_NAME")');
    expect(worker).toContain("buildFactoryUnsentReminderContent(values)");
    expect(worker).toContain("factoryUnsentReminderAt(order)");
    expect(worker).toContain("from: EMAIL_FROM");

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

  it("queues daily unassigned-driver email and WATI reminders for internal recipients", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260828151000_driver_assignment_email_reminders.sql",
      ),
      "utf8",
    );
    const worker = readFileSync(
      resolve(process.cwd(), "supabase/functions/wati-order-notifications/index.ts"),
      "utf8",
    );

    expect(migration).toContain("create table public.driver_assignment_internal_reminder_outbox");
    expect(migration).toContain("unique (reminder_date, channel, recipient_key)");
    expect(migration).toContain("where profile.email_noti");
    expect(migration).toContain("order_first_notification_recipients");
    expect(migration).toContain("for update skip locked");
    expect(worker).toContain('Deno.env.get("DRIVER_ASSIGNMENT_REMINDER_HOUR_HK")');
    expect(worker).toContain('"enqueue_driver_assignment_internal_reminders"');
    expect(worker).toContain('"claim_driver_assignment_internal_reminders"');
    expect(worker).toContain('Deno.env.get("WATI_DRIVER_ASSIGNMENT_REMINDER_TEMPLATE_NAME")');
    expect(worker).toContain('name: "orders"');
    expect(worker).toContain('.is("motorcade_id", null)');
    expect(worker).toContain("buildUnassignedDriverReminderContent");
    expect(worker).toContain("/orders/${encodeURIComponent(order.id)}");
  });

  it("uses the delivery sales address for every Resend email", () => {
    const sender = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/email-sender.ts"),
      "utf8",
    );
    const senders = [
      "supabase/functions/wati-order-notifications/index.ts",
      "supabase/functions/send-order-wati-confirmation/index.ts",
      "supabase/functions/send-quote-confirmation/index.ts",
      "supabase/functions/send-daily-sales-report/index.ts",
    ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8"));

    expect(sender).toContain('EMAIL_FROM = "system@foodchannels-delivery.com"');
    for (const implementation of senders) {
      expect(implementation).toContain('import { EMAIL_FROM } from "../_shared/email-sender.ts"');
      expect(implementation).toContain("from: EMAIL_FROM");
      expect(implementation).not.toMatch(
        /QUOTE_EMAIL_FROM|DAILY_SALES_EMAIL_FROM|ORDER_NOTIFICATION_EMAIL_FROM/,
      );
    }
  });
});
