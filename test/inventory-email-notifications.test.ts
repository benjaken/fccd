import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildInventoryForecastEmail,
  buildMinimumStockEmail,
} from "../supabase/functions/_shared/inventory-email";

const migration = readFileSync(
  "supabase/migrations/20260908120000_inventory_email_alerts.sql",
  "utf8",
);
const warehousePage = readFileSync(
  "src/components/FactoryWarehousePages.tsx",
  "utf8",
);

describe("inventory email notifications", () => {
  it("includes every formal customer-order BOM and unshipped FC replenishment demand", () => {
    expect(migration).toContain("from public.order_bom_requirements requirement");
    expect(migration).toContain("join public.orders catering_order");
    expect(migration).toContain("join public.product_ingredients recipe on recipe.product_id = line.product_id");
    expect(migration).toContain("join public.order_package_choice_snapshots choice");
    expect(migration).toContain("request.status in ('submitted', 'reviewed', 'sent_to_factory')");
    expect(migration).toContain("todo.todo_key = 'cancelled'");
    expect(migration).toContain("catering_line.is_void is false");
  });

  it("flags formal order lines that have no ingredient or packaging BOM", () => {
    expect(migration).toContain("inventory_forecast_unmapped_order_lines");
    expect(migration).toContain("catering_order.document_type = 'order'");
    const email = buildInventoryForecastEmail({
      startDate: "2026-09-08",
      days: 14,
      lines: [],
      unmappedLines: [{ orderNumber: "O-1", itemName: "套餐 A", deliveryDate: "2026-09-09" }],
    });
    expect(email.subject).toContain("1 項未設定用料");
    expect(email.html).toContain("尚未設定食材／包裝");
  });

  it("schedules the digest for midnight Hong Kong time and deduplicates each calendar day", () => {
    expect(migration).toContain("'0 16 * * *'");
    expect(migration).toContain("'daily_forecast:' || p_run_date::text");
    expect(migration).toContain("'startDate', p_run_date, 'days', 14");
  });

  it("queues only threshold crossings and resets after stock recovers", () => {
    expect(migration).toContain("v_current <= v_item.minimum_stock_level");
    expect(migration).toContain("not v_had_previous or not v_previous.below_minimum");
    expect(migration).toContain("last_recovered_at");
    expect(migration).toContain("crossing_count");
  });

  it("keeps every shortage notification off until verified stock is ready", () => {
    expect(migration).toContain("shortage_notifications_enabled boolean not null default false");
    expect(migration).toContain("private.inventory_shortage_notifications_enabled()");
    expect(migration).toContain("return null;");
    expect(migration).toContain("return 0;");
    expect(migration).toContain("shortage_notifications_disabled");
    expect(warehousePage).toContain("fetchInventoryShortageNotificationControl");
    expect(warehousePage).toContain("setInventoryShortageNotificationsEnabled");
    expect(warehousePage).toContain("shortageNotificationsEnabled");
  });

  it("builds an all-clear daily email when no shortage exists", () => {
    const email = buildInventoryForecastEmail({ startDate: "2026-09-08", days: 14, lines: [] });
    expect(email.subject).toContain("暫無不足");
    expect(email.html).toContain("暫時沒有庫存不足項目");
    expect(email.html).toContain("2026-09-21");
  });

  it("escapes product names in threshold emails", () => {
    const email = buildMinimumStockEmail({
      name: "Milk <urgent>",
      sku: "A&B",
      unit: "箱",
      warehouse: "dry",
      currentStock: 3,
      minimumStock: 3,
    });
    expect(email.subject).toContain("Milk <urgent>");
    expect(email.html).toContain("Milk &lt;urgent&gt;");
    expect(email.html).toContain("A&amp;B");
  });
});
