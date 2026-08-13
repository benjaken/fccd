import { supabase } from "@/lib/supabase";

export const LARGE_QUOTE_THRESHOLD = 10_000;

export type DashboardJob = {
  id: string;
  orderNumber: string | null;
  customerName: string | null;
  deliveryAt: string | null;
  shipOutTime: string | null;
  deliveryStatus: string | null;
  isSentToFactory: boolean | null;
  amount: number | null;
  currency: string;
};

export type DashboardData = {
  metrics: {
    ordersToday: number;
    ordersChange: number | null;
    revenueToday: number | null;
    revenueChange: number | null;
    pendingDeliveries: number;
    lowStock: number | null;
  };
  queues: {
    highChanceQuotes: number;
    largeQuotes: number;
    unpaidOrders: number;
    unassignedDrivers: number;
    deliveredUnpaid: number;
  };
  progress: {
    confirmed: number;
    preparing: number;
    ready: number;
    shipping: number;
    completed: number;
  };
  jobs: DashboardJob[];
};

type OrderRow = {
  id: string;
  order_number: string | null;
  customer_name_snapshot: string | null;
  company_name_snapshot: string | null;
  delivery_at: string | null;
  ship_out_time: string | null;
  delivery_status: string | null;
  is_sent_to_factory: boolean | null;
  grand_total: number | string | null;
  currency: string | null;
};

type PaymentRow = {
  amount: number | string | null;
};

function hongKongDateParts(value: Date) {
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

function isoDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function dashboardDayBounds(now: Date) {
  const { year, month, day } = hongKongDateParts(now);
  const today = isoDate(year, month, day);
  const tomorrow = isoDate(year, month, day + 1);
  const yesterday = isoDate(year, month, day - 1);

  return {
    todayStart: `${today}T00:00:00+08:00`,
    tomorrowStart: `${tomorrow}T00:00:00+08:00`,
    yesterdayStart: `${yesterday}T00:00:00+08:00`,
  };
}

function sumPayments(rows: PaymentRow[] | null) {
  return (rows ?? []).reduce(
    (total, row) => total + Number.parseFloat(String(row.amount ?? 0)),
    0,
  );
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function isCompleted(status: string | null) {
  return status === "己送達" || status === "已送達";
}

function progressFromOrders(rows: OrderRow[]) {
  const progress = {
    confirmed: 0,
    preparing: 0,
    ready: 0,
    shipping: 0,
    completed: 0,
  };

  for (const order of rows) {
    if (isCompleted(order.delivery_status)) {
      progress.completed += 1;
    } else if (order.delivery_status === "送貨途中") {
      progress.shipping += 1;
    } else if (order.delivery_status === "待取貨") {
      progress.ready += 1;
    } else if (order.is_sent_to_factory) {
      progress.preparing += 1;
    } else {
      progress.confirmed += 1;
    }
  }

  return progress;
}

function requireSuccess(error: { message: string } | null) {
  if (error) throw error;
}

async function roleHasPageAccess(
  role: string | null | undefined,
  pageKey: string,
) {
  if (!role) return false;
  if (role === "Super Admin") return true;
  const { data, error } = await supabase
    .from("role_page_permissions")
    .select("can_access")
    .eq("role", role)
    .eq("page_key", pageKey)
    .maybeSingle();
  if (error) throw error;
  return data?.can_access === true;
}

export async function fetchDashboardData(
  now = new Date(),
  role?: string | null,
): Promise<DashboardData> {
  const { todayStart, tomorrowStart, yesterdayStart } = dashboardDayBounds(now);
  // role === undefined keeps full metrics for callers/tests that omit role.
  const canViewFinance =
    role === undefined || (await roleHasPageAccess(role, "finance"));
  const canViewInventory =
    role === undefined || (await roleHasPageAccess(role, "inventory"));
  const orderFields =
    "id,order_number,customer_name_snapshot,company_name_snapshot,delivery_at,ship_out_time,delivery_status,is_sent_to_factory,grand_total,currency";

  const [
    todayOrdersResult,
    yesterdayOrdersResult,
    todayPaymentsResult,
    yesterdayPaymentsResult,
    highChanceResult,
    largeQuotesResult,
    unpaidOrdersResult,
    unassignedDriversResult,
    deliveredUnpaidResult,
    lowStockResult,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select(orderFields)
      .eq("document_type", "order")
      .is("archived_at", null)
      .gte("delivery_at", todayStart)
      .lt("delivery_at", tomorrowStart)
      .order("delivery_at", { ascending: true }),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("document_type", "order")
      .is("archived_at", null)
      .gte("delivery_at", yesterdayStart)
      .lt("delivery_at", todayStart),
    canViewFinance
      ? supabase
          .from("payments")
          .select("amount")
          .is("voided_at", null)
          .gte("payment_at", todayStart)
          .lt("payment_at", tomorrowStart)
      : Promise.resolve({ data: [], error: null }),
    canViewFinance
      ? supabase
          .from("payments")
          .select("amount")
          .is("voided_at", null)
          .gte("payment_at", yesterdayStart)
          .lt("payment_at", todayStart)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("document_type", "quote")
      .eq("quote_status", "High Chance")
      .is("archived_at", null),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("document_type", "quote")
      .gte("grand_total", LARGE_QUOTE_THRESHOLD)
      .or(
        'quote_status.is.null,quote_status.not.in.("Done Deal","Case Closed")',
      )
      .is("archived_at", null),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("document_type", "order")
      .gt("outstanding", 0)
      .is("archived_at", null),
    supabase
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .is("motorcade_id", null)
      .is("subdriver_id", null)
      .is("fulfilled_at", null)
      .not("order_id", "is", null),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("document_type", "order")
      .in("delivery_status", ["己送達", "已送達"])
      .gt("outstanding", 0)
      .is("archived_at", null),
    supabase.rpc("get_dashboard_low_stock_count"),
  ]);

  [
    todayOrdersResult,
    yesterdayOrdersResult,
    todayPaymentsResult,
    yesterdayPaymentsResult,
    highChanceResult,
    largeQuotesResult,
    unpaidOrdersResult,
    unassignedDriversResult,
    deliveredUnpaidResult,
    lowStockResult,
  ].forEach((result) => requireSuccess(result.error));

  const orders = (todayOrdersResult.data ?? []) as OrderRow[];
  const revenueToday = sumPayments(todayPaymentsResult.data as PaymentRow[] | null);
  const revenueYesterday = sumPayments(
    yesterdayPaymentsResult.data as PaymentRow[] | null,
  );
  const ordersYesterday = yesterdayOrdersResult.count ?? 0;

  return {
    metrics: {
      ordersToday: orders.length,
      ordersChange: percentageChange(orders.length, ordersYesterday),
      revenueToday: canViewFinance ? revenueToday : null,
      revenueChange: canViewFinance
        ? percentageChange(revenueToday, revenueYesterday)
        : null,
      pendingDeliveries: orders.filter(
        (order) => !isCompleted(order.delivery_status),
      ).length,
      lowStock: canViewInventory ? Number(lowStockResult.data ?? 0) : null,
    },
    queues: {
      highChanceQuotes: highChanceResult.count ?? 0,
      largeQuotes: largeQuotesResult.count ?? 0,
      unpaidOrders: unpaidOrdersResult.count ?? 0,
      unassignedDrivers: unassignedDriversResult.count ?? 0,
      deliveredUnpaid: deliveredUnpaidResult.count ?? 0,
    },
    progress: progressFromOrders(orders),
    jobs: orders.slice(0, 10).map((order) => ({
      id: order.id,
      orderNumber: order.order_number,
      customerName:
        order.company_name_snapshot || order.customer_name_snapshot || null,
      deliveryAt: order.delivery_at,
      shipOutTime: order.ship_out_time,
      deliveryStatus: order.delivery_status,
      isSentToFactory: order.is_sent_to_factory,
      amount:
        order.grand_total === null
          ? null
          : Number.parseFloat(String(order.grand_total)),
      currency: order.currency || "HKD",
    })),
  };
}
