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
import {
  createNotificationRecipientPolicy,
  isNotificationEmailAllowed,
  isNotificationPhoneAllowed,
  isNotificationRecipientPairAllowed,
  normalizeNotificationPhone,
  parseNotificationRecipientAllowlist,
} from "../supabase/functions/_shared/notification-recipient-allowlist.ts";

const values: OrderNotificationValues = {
  name: "陳先生",
  order_number: "R/202608/88",
  date: "28/08/2026",
  time: "12:00 - 13:00",
  address: "九龍測試地址",
  phone: "+852 9123 4567",
  delivery_method: "送貨上門",
  ao_deadline: "26/08/2026",
  ao_link: "https://example.com/add-ons",
  shop_name: "Food Channels Catering",
};

describe("WATI order notifications", () => {
  it("fails closed and requires the configured phone and email to match", () => {
    const allowlist = parseNotificationRecipientAllowlist(
      "+852 9123 4567, +86 138 0013 8000",
      "ops@example.com",
    );

    expect(normalizeNotificationPhone("00 86 138 0013 8000"))
      .toBe("8613800138000");
    expect(isNotificationPhoneAllowed(allowlist, "+86 13800138000")).toBe(true);
    expect(isNotificationEmailAllowed(allowlist, " OPS@example.com ")).toBe(true);
    expect(isNotificationRecipientPairAllowed(
      allowlist,
      "+86 13800138000",
      "ops@example.com",
    )).toBe(true);
    expect(isNotificationRecipientPairAllowed(
      allowlist,
      "+86 13800138000",
      "customer@example.com",
    )).toBe(false);
    expect(() => parseNotificationRecipientAllowlist("", "ops@example.com"))
      .toThrow("notification_recipient_allowlist_missing");
  });

  it("allows valid production recipients only when enforcement is explicitly disabled", () => {
    const policy = createNotificationRecipientPolicy("", "", "false");

    expect(policy.enforced).toBe(false);
    expect(isNotificationPhoneAllowed(policy, "+852 9123 4567")).toBe(true);
    expect(isNotificationEmailAllowed(policy, "customer@example.com")).toBe(true);
    expect(isNotificationRecipientPairAllowed(
      policy,
      "+852 9123 4567",
      "customer@example.com",
    )).toBe(true);
    expect(isNotificationPhoneAllowed(policy, "not-a-phone")).toBe(false);
    expect(isNotificationEmailAllowed(policy, "")).toBe(false);
    expect(() => createNotificationRecipientPolicy("", "", "sometimes"))
      .toThrow("notification_recipient_allowlist_enforcement_invalid");
  });

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
    const pickup = buildOrderNotificationContent("pickup_order_confirmed", values);

    expect(notification.subject).toContain(values.order_number);
    expect(notification.text).toContain(`Hello ${values.name},`);
    expect(notification.text).toContain(`日期：${values.date}`);
    expect(notification.text).toContain(`時間：${values.time}`);
    expect(notification.text).toContain(`地址：${values.address}`);
    expect(notification.text).toContain(values.ao_link);
    expect(notification.text).toContain("-----------------------");
    expect(notification.text).toContain(`限時加單推介 (請在${values.ao_deadline}下午3點前加單)：`);
    expect(notification.html).toContain("Food Channels Catering");
    expect(notification.html).toContain('role="presentation"');
    expect(notification.html).toContain("fc-catering-logo-email.png");
    expect(notification.html).toContain("https://wa.me/85253964335");
    expect(notification.html).toContain("(+852) 2185 7373");
    expect(notification.html).toContain("sales@foodchannels-catering.com");
    expect(notification.html).toContain(`href="${values.ao_link}"`);
    expect(pickup.text).toBe([
      `Hello ${values.name},`, "",
      `收到你的到會訂單 ${values.order_number}, 謝謝！`, "",
      "你訂購的到會套餐將會在以下時間準備好，請安排取餐。",
      `取餐日期：${values.date}`, `取餐時間：${values.time}`,
      "取餐地址：荃灣青山公路459-469號華力工業中心5樓R室",
      "*請留意食品數量可能比較多，建議多找一位朋友幫手取餐。", "",
      "如取餐當天有任何查詢，請Whatsapp此電話聯絡我們。", "",
      "謝謝你的支持，願你有一個愉快的聚餐時光🥳",
    ].join("\n"));
  });

  it("keeps the selected manual Utility email copy aligned with WATI", () => {
    const badWeather = buildOrderNotificationContent("bad_weather_notice", values);
    const holiday = buildOrderNotificationContent("holiday_service_notice", values);
    const secondContact = buildOrderNotificationContent("second_contact_requested", values);
    const delayed = buildOrderNotificationContent("delivery_delayed", values);

    expect(badWeather.text).toContain("👉🏻【更改送貨日期】");
    expect(badWeather.text).toContain("已付費用可保留60天內使用，逾期作廢。");
    expect(badWeather.text).toContain("請大家密切留意我們的Whatsapp通知最新安排🔥");
    expect(holiday.text).toContain("節日期間交通情況較難預測");
    expect(holiday.text).toContain("加厚餐盒可以直接放進微波爐、電陶爐或明火上直接加熱🔥");
    expect(holiday.text).toContain("祝你有一個愉快的用餐體驗，節日快樂！");
    expect(secondContact.text).toBe([
      `你好，${values.order_number} 會在 ${values.date} 送餐。`, "",
      `由於運輸繁忙，除了 ${values.phone} 之外，請提供第二收貨聯絡人電話，以便收貨當日順利進行。`,
    ].join("\n"));
    expect(delayed.text).toBe(
      `剛已聯絡司機，由於路面狀況稍有阻滯，訂單會延誤 ${values.time} 分鐘，司機正盡力在安全的情況下全速前進，請見諒🙇‍♀️`,
    );
  });

  it("keeps same-day delivery and pickup emails aligned with their WATI templates", () => {
    const delivery = buildOrderNotificationContent("delivery_today_reminder", values);
    const pickup = buildOrderNotificationContent("pickup_today_reminder", values);

    expect(delivery.text).toBe([
      `Hello ${values.name},`, "",
      `你的到會訂單 ${values.order_number} 將會在今日送貨，司機會在到達前致電給你，請保持聯絡電話暢通。`, "",
      `日期：${values.date}`, `時間：${values.time}`, `地址：${values.address}`, "",
      "如有任何查詢，請在此 WhatsApp 聯絡我們。", "",
      "查看訂單內容 或 下載收據：https://www.foodchannels-delivery.com/self_service_search", "",
      "謝謝你的支持，願你有一個愉快的聚餐時光❤️", "",
      `${values.shop_name} 客戶服務團隊`,
    ].join("\n"));
    expect(pickup.text).toBe([
      `Hello ${values.name},`, "",
      `你的到會訂單 ${values.order_number} 將於今日備妥，請在已預約的時間內到達取貨。`, "",
      `取餐日期：${values.date}`, `取餐時間：${values.time}`,
      "取餐地址：荃灣青山公路459-469號華力工業中心5樓R室",
      "*請留意食品數量如果比較多，建議多找一位朋友幫手取餐。", "",
      "如有任何查詢，請在此 WhatsApp 聯絡我們。", "",
      "查看訂單內容 或 下載收據：https://www.foodchannels-delivery.com/self_service_search", "",
      "謝謝你的支持，願你有一個愉快的聚餐時光❤️", "",
      `${values.shop_name} 客戶服務團隊`,
    ].join("\n"));
    expect(delivery.html).toContain('href="https://www.foodchannels-delivery.com/self_service_search"');
    expect(pickup.html).toContain('href="https://www.foodchannels-delivery.com/self_service_search"');
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

  it("maps fcc2 delivery reminders to same-day deliveries and keeps sending disabled", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260828183000_fix_fcc2_delivery_reminder_day.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("where event_key = 'delivery_today_reminder'");
    expect(migration).toContain("template_name = 'fcc2_delivery_reminder'");
    expect(migration).toContain("where event_key = 'delivery_tomorrow_reminder'");
    expect(migration).toContain("template_name = 'delivery_tomorrow_reminder'");
    expect(migration.match(/is_active = false/g)).toHaveLength(2);
  });

  it("renames FCCD reminders and maps self-pick to the same-day event", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260831122000_rename_wati_fccd_reminder_templates.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("template_name = 'fccd_delivery_reminder'");
    expect(migration).toContain("where template_name = 'fcc2_delivery_reminder'");
    expect(migration).toContain("template_name = 'pickup_tomorrow_reminder'");
    expect(migration).toContain("where event_key = 'pickup_tomorrow_reminder'");
    expect(migration).toContain("template_name = 'fccd_selfpick_reminder'");
    expect(migration).toContain("where event_key = 'pickup_today_reminder'");
    expect(migration).not.toContain("is_active");
  });

  it("moves the same-day self-pick reminder to the latest template name", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260831131000_rename_wati_selfpick_reminder.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("template_name = 'fccd_selfpick_reminder1'");
    expect(migration).toContain("where event_key = 'pickup_today_reminder'");
    expect(migration).not.toContain("is_active");
  });

  it("schedules same-day delivery reminders at 09:00 or two hours before windows starting by 11:00", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260831132000_schedule_same_day_delivery_reminders.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("private.wati_delivery_start_time");
    expect(migration).toContain("v_delivery_start <= time '11:00'");
    expect(migration).toContain("v_delivery_start - interval '2 hours'");
    expect(migration).toContain("v_delivery_date + time '09:00'");
    expect(migration).toContain("p_now < private.wati_delivery_reminder_at(v_order)");
    expect(migration).toContain("v_event_key := 'delivery_today_reminder'");
    expect(migration).not.toContain("v_event_key := 'delivery_tomorrow_reminder'");
    expect(migration).toContain("v_event_key := 'pickup_today_reminder'");
    expect(migration).not.toContain("v_event_key := 'pickup_tomorrow_reminder'");
    expect(migration).toContain("v_delivery_date + time '09:00'");
    expect(migration).toContain("set is_active = false");
  });

  it("uses the confirmed FCCD driver reminder with only date and count", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260831123000_rename_wati_driver_assignment_reminder.sql",
      ),
      "utf8",
    );
    const worker = readFileSync(
      resolve(process.cwd(), "supabase/functions/wati-order-notifications/index.ts"),
      "utf8",
    );

    expect(migration).toContain("template_name = 'fccd_driver_assign_reminder_v1'");
    expect(migration).toContain(`{"name":"date","source":"date"}`);
    expect(migration).toContain(`{"name":"count","source":"count"}`);
    expect(migration).not.toContain("is_active");
    expect(worker).toContain('|| "fccd_driver_assign_reminder_v1"');
    expect(worker).toContain("function driverReminderSlot");
    expect(worker).toContain('{ name: "date", value:');
    expect(worker).toContain('{ name: "count", value:');
    expect(worker).not.toContain('name: "orders"');
    expect(worker).not.toContain('requiredEnv("ORDER_ADMIN_BASE_URL")');
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
    expect(implementation).toContain("isNotificationRecipientPairAllowed");
    expect(implementation).toContain("notification_recipient_not_allowlisted");
  });

  it("starts quote WATI and Resend confirmation sends together", () => {
    const implementation = readFileSync(
      resolve(process.cwd(), "supabase/functions/send-quote-confirmation/index.ts"),
      "utf8",
    );

    expect(implementation).toContain("await Promise.allSettled([");
    expect(implementation).toContain("wati_and_email_send_failed");
    expect(implementation).toContain("watiSent: true, emailSent: true");
    expect(implementation).toContain("isNotificationRecipientPairAllowed");
    expect(implementation).toContain("notification_recipient_not_allowlisted");
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
    expect(worker).toContain("isNotificationRecipientPairAllowed");
    expect(worker).toContain("notification_recipient_not_allowlisted");

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
    const repeatMigration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260831133000_repeat_driver_assignment_reminders.sql",
      ),
      "utf8",
    );
    expect(worker).toContain('Deno.env.get("DRIVER_ASSIGNMENT_REMINDER_HOUR_HK")');
    expect(worker).toContain('Deno.env.get("DRIVER_ASSIGNMENT_REMINDER_INTERVAL_HOURS")');
    expect(worker).toContain("configured !== 9");
    expect(worker).toContain("interval !== 3");
    expect(worker).toContain("(local.hour - configured) % interval !== 0");
    expect(worker).toContain("local.hour > 21");
    expect(worker).toContain('"enqueue_driver_assignment_internal_reminders"');
    expect(worker).toContain("p_reminder_hour: dueDriverReminder.hour");
    expect(worker).toContain('"claim_driver_assignment_internal_reminders"');
    expect(worker).toContain('Deno.env.get("WATI_DRIVER_ASSIGNMENT_REMINDER_TEMPLATE_NAME")');
    expect(worker).toContain('|| "fccd_driver_assign_reminder_v1"');
    expect(worker).toContain("return { date: nextDateKey(local.date), hour: local.hour };");
    expect(worker).toContain('{ name: "date", value:');
    expect(worker).toContain('{ name: "count", value:');
    expect(worker).not.toContain('name: "orders"');
    expect(worker).toContain('.is("motorcade_id", null)');
    expect(worker).toContain("buildUnassignedDriverReminderContent");
    expect(worker).toContain("/orders/${encodeURIComponent(order.id)}");
    expect(repeatMigration).toContain("p_reminder_hour not in (9, 12, 15, 18, 21)");
    expect(repeatMigration).toContain("unique (reminder_date, reminder_hour, channel, recipient_key)");
    expect(repeatMigration).toContain("template.event_key = 'driver_assigned'");
    expect(repeatMigration).toContain("set is_active = false");
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
