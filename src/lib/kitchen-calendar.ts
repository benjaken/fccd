import { supabase } from "@/lib/supabase";
import { isOrderDelivered } from "@/lib/orders";
import {
  fetchOrderStatusCatalog,
  resolveOrderStatuses,
  type ConfiguredOrderStatus,
  type OrderStatusView,
} from "@/lib/order-statuses";

export const KITCHEN_CALENDAR_VISIBLE_PER_DAY = 4;
export const KITCHEN_CALENDAR_PAGE_SIZE = 1000;
export const KITCHEN_CALENDAR_MAX_ROWS = 5000;

export type KitchenCalendarTone = "blue" | "amber" | "red";

export type KitchenCalendarOrder = {
  id: string;
  orderNumber: string | null;
  customerName: string | null;
  companyName: string | null;
  deliveryAt: string | null;
  factoryDate: string | null;
  deliveryStatus: string | null;
  isSentToFactory: boolean | null;
  outstanding: number | null;
  statuses: OrderStatusView[];
};

export type KitchenCalendarDay = {
  key: string;
  year: number;
  month: number;
  day: number;
  inMonth: boolean;
  isToday: boolean;
};

type OrderRow = {
  id: string;
  order_number: string | null;
  customer_name_snapshot: string | null;
  company_name_snapshot: string | null;
  delivery_at: string | null;
  factory_date: string | null;
  delivery_status: string | null;
  is_sent_to_factory: boolean | null;
  outstanding: number | string | null;
  order_status_legacy_ids: string[] | null;
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function civilKey(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function optionalAmount(value: number | string | null | undefined) {
  return value === null || value === undefined
    ? null
    : Number.parseFloat(String(value));
}

export function hongKongDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return {
    year: Number(part("year")),
    month: Number(part("month")),
    day: Number(part("day")),
  };
}

export function hongKongDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const { year, month, day } = hongKongDateParts(date);
  if (!year || !month || !day) return "";
  return civilKey(year, month, day);
}

export const KITCHEN_CALENDAR_FROM = "calendar";

export function kitchenCalendarMonthParam(year: number, month: number) {
  return `${year}-${pad2(month)}`;
}

export function kitchenCalendarOrderHref(orderId: string, month: string) {
  const params = new URLSearchParams({
    from: KITCHEN_CALENDAR_FROM,
    month,
  });
  return `/orders/${orderId}?${params.toString()}`;
}

export function kitchenCalendarReturnPath(
  from: string | null | undefined,
  month: string | null | undefined,
) {
  if (from !== KITCHEN_CALENDAR_FROM) return null;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    return `/kitchen/calendar?month=${month}`;
  }
  return "/kitchen/calendar";
}

export function parseKitchenCalendarMonth(
  value: string | null | undefined,
  fallback: Date,
) {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) {
      return { year, month };
    }
  }
  const parts = hongKongDateParts(fallback);
  return { year: parts.year, month: parts.month };
}

export function shiftKitchenCalendarMonth(
  year: number,
  month: number,
  delta: number,
) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function buildKitchenCalendarGrid(
  year: number,
  month: number,
  todayKey: string,
): KitchenCalendarDay[] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const start = new Date(Date.UTC(year, month - 1, 1 - firstWeekday));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getTime() + index * 86_400_000);
    const cellYear = date.getUTCFullYear();
    const cellMonth = date.getUTCMonth() + 1;
    const cellDay = date.getUTCDate();
    const key = civilKey(cellYear, cellMonth, cellDay);
    return {
      key,
      year: cellYear,
      month: cellMonth,
      day: cellDay,
      inMonth: cellYear === year && cellMonth === month,
      isToday: key === todayKey,
    };
  });
}

export function kitchenCalendarRangeIso(days: KitchenCalendarDay[]) {
  const start = days[0];
  const end = days[days.length - 1];
  if (!start || !end) {
    return { start: "", end: "" };
  }
  const next = new Date(Date.UTC(end.year, end.month - 1, end.day + 1));
  const nextKey = civilKey(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
  );
  return {
    start: new Date(`${start.key}T00:00:00+08:00`).toISOString(),
    end: new Date(`${nextKey}T00:00:00+08:00`).toISOString(),
  };
}

export function kitchenCalendarDayKey(order: {
  factoryDate: string | null;
  deliveryAt: string | null;
}) {
  const value = order.factoryDate || order.deliveryAt;
  return value ? hongKongDayKey(value) : "";
}

export type KitchenCalendarStatus =
  | "completed"
  | "shipping"
  | "ready"
  | "awaitingDriver"
  | "preparing"
  | "confirmed";

export function kitchenCalendarStatus(order: {
  deliveryStatus: string | null;
  isSentToFactory: boolean | null;
}): KitchenCalendarStatus {
  if (isOrderDelivered(order.deliveryStatus)) {
    return "completed";
  }
  if (order.deliveryStatus === "送貨途中") return "shipping";
  if (order.deliveryStatus === "待取貨") return "ready";
  if (
    order.deliveryStatus === "待接單" ||
    order.deliveryStatus === "未派車隊"
  ) {
    return "awaitingDriver";
  }
  if (order.isSentToFactory) return "preparing";
  return "confirmed";
}

export function kitchenCalendarTone(order: {
  deliveryStatus?: string | null;
  isSentToFactory: boolean | null;
  outstanding: number | null;
}): KitchenCalendarTone {
  // Delivered orders keep their live delivery state. Leftover unpaid /
  // factory-send tags and outstanding amounts must not override 已送達.
  if (isOrderDelivered(order.deliveryStatus)) return "blue";
  if ((order.outstanding ?? 0) > 0) return "red";
  if (order.isSentToFactory === false) return "amber";
  return "blue";
}

function mapOrder(
  row: OrderRow,
  catalog: readonly ConfiguredOrderStatus[],
): KitchenCalendarOrder {
  return {
    id: row.id,
    orderNumber: row.order_number,
    customerName: row.customer_name_snapshot,
    companyName: row.company_name_snapshot,
    deliveryAt: row.delivery_at,
    factoryDate: row.factory_date,
    deliveryStatus: row.delivery_status,
    isSentToFactory: row.is_sent_to_factory,
    outstanding: optionalAmount(row.outstanding),
    statuses: resolveOrderStatuses(row.order_status_legacy_ids, catalog),
  };
}

export async function fetchKitchenCalendarOrders({
  start,
  end,
}: {
  start: string;
  end: string;
}): Promise<KitchenCalendarOrder[]> {
  const items: KitchenCalendarOrder[] = [];
  let from = 0;
  const catalog = await fetchOrderStatusCatalog();

  while (from < KITCHEN_CALENDAR_MAX_ROWS) {
    const to = from + KITCHEN_CALENDAR_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id,order_number,customer_name_snapshot,company_name_snapshot,delivery_at,factory_date,delivery_status,is_sent_to_factory,outstanding,order_status_legacy_ids",
      )
      .eq("document_type", "order")
      .is("archived_at", null)
      .or(
        `and(factory_date.gte."${start}",factory_date.lt."${end}"),and(delivery_at.gte."${start}",delivery_at.lt."${end}")`,
      )
      .order("delivery_at", { ascending: true, nullsFirst: false })
      .order("order_number", { ascending: true, nullsFirst: false })
      .range(from, to);

    if (error) throw error;

    const rows = ((data ?? []) as unknown as OrderRow[]).map((row) =>
      mapOrder(row, catalog),
    );
    items.push(...rows);
    if (rows.length < KITCHEN_CALENDAR_PAGE_SIZE) break;
    from += KITCHEN_CALENDAR_PAGE_SIZE;
  }

  return items;
}
