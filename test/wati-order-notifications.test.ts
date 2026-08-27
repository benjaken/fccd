import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
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
});
