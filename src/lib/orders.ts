import { supabase } from "@/lib/supabase";
import {
  catalogLegacyIdsForNames,
  fetchOrderStatusCatalog,
  isOrderTagQueuePreset,
  ORDER_TAG_QUEUE_NAMES,
  resolveOrderStatuses,
  type ConfiguredOrderStatus,
  type OrderStatusView,
} from "@/lib/order-statuses";

export const ORDERS_PAGE_SIZE = 15;

export type OrderPreset =
  | "all"
  | "pending"
  | "unpaid"
  | "delivered-unpaid"
  | "kitchen"
  | "monthly-settlement"
  | "split"
  | "kitchen-notes"
  | "reschedule-pending"
  | "shopify-pending";

export type OrderStatusFilter =
  | ""
  | "confirmed"
  | "preparing"
  | "ready"
  | "pickedUp"
  | "awaitingDriver"
  | "shipping"
  | "completed";

export type OperationalOrderStatus = Exclude<OrderStatusFilter, "">;

const LATER_KITCHEN_DELIVERY_STATUSES = [
  "己送達",
  "已送達",
  "送貨途中",
  "待取貨",
  "已取",
  "已取貨",
  "待接單",
] as const;

export function isOrderDelivered(deliveryStatus: string | null | undefined) {
  return deliveryStatus === "己送達" || deliveryStatus === "已送達";
}

export function isOrderPickedUp(deliveryStatus: string | null | undefined) {
  return deliveryStatus === "已取" || deliveryStatus === "已取貨";
}

export function operationalOrderStatus(order: {
  deliveryStatus: string | null;
  isSentToFactory: boolean | null;
}): OperationalOrderStatus {
  if (isOrderDelivered(order.deliveryStatus)) {
    return "completed";
  }
  if (order.deliveryStatus === "送貨途中") return "shipping";
  if (order.deliveryStatus === "待取貨") return "ready";
  if (isOrderPickedUp(order.deliveryStatus)) return "pickedUp";
  if (
    order.deliveryStatus === "待接單" ||
    order.deliveryStatus === "未派車隊"
  ) {
    return "confirmed";
  }
  if (order.isSentToFactory) return "preparing";
  return "confirmed";
}

export function operationalOrderStatusTone(status: OperationalOrderStatus) {
  if (status === "completed" || status === "ready" || status === "pickedUp") {
    return "green";
  }
  if (status === "preparing") return "amber";
  return "blue";
}

export type OrderListItem = {
  id: string;
  orderNumber: string | null;
  customerName: string | null;
  companyName: string | null;
  deliveryAt: string | null;
  factoryDate: string | null;
  shipOutTime: string | null;
  deliveryStatus: string | null;
  isSentToFactory: boolean | null;
  grandTotal: number | null;
  outstanding: number | null;
  currency: string;
  createdAt: string;
  statuses: OrderStatusView[];
};

export type OrderListResult = {
  items: OrderListItem[];
  total: number;
};

export type OrderListFilters = {
  page: number;
  search: string;
  status: OrderStatusFilter;
  preset: OrderPreset;
  canViewFinance: boolean;
};

type OrderRow = {
  id: string;
  order_number: string | null;
  customer_name_snapshot: string | null;
  company_name_snapshot: string | null;
  delivery_at: string | null;
  factory_date: string | null;
  ship_out_time: string | null;
  delivery_status: string | null;
  is_sent_to_factory: boolean | null;
  grand_total?: number | string | null;
  outstanding?: number | string | null;
  currency: string | null;
  bubble_created_at: string | null;
  created_at: string;
  order_status_legacy_ids: string[] | null;
};

function safeSearchTerm(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s@+\-#]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function optionalAmount(value: number | string | null | undefined) {
  return value === null || value === undefined
    ? null
    : Number.parseFloat(String(value));
}

function applyStatusFilter<
  T extends {
    eq: (column: string, value: unknown) => T;
    in: (column: string, values: readonly unknown[]) => T;
    or: (filters: string) => T;
  },
>(query: T, status: OrderStatusFilter, preset: OrderPreset) {
  switch (status) {
    case "completed":
      return query.in("delivery_status", ["己送達", "已送達"]);
    case "shipping":
      return query.eq("delivery_status", "送貨途中");
    case "ready":
      return query.eq("delivery_status", "待取貨");
    case "pickedUp":
      return query.in("delivery_status", ["已取", "已取貨"]);
    case "awaitingDriver":
      return query.eq("delivery_status", "待接單");
    case "preparing": {
      const excluded =
        preset === "kitchen"
          ? LATER_KITCHEN_DELIVERY_STATUSES
          : (["己送達", "已送達", "送貨途中", "待取貨", "已取", "已取貨"] as const);
      const next =
        preset === "kitchen" ? query : query.eq("is_sent_to_factory", true);
      return next.or(
        `delivery_status.is.null,delivery_status.not.in.("${excluded.join('","')}")`,
      );
    }
    case "confirmed":
      return query
        .or("delivery_status.is.null,delivery_status.in.(未派車隊,待接單)")
        .or("is_sent_to_factory.is.null,is_sent_to_factory.eq.false");
    default:
      return query;
  }
}

export async function fetchOrders({
  page,
  search,
  status,
  preset,
  canViewFinance,
}: OrderListFilters): Promise<OrderListResult> {
  const start = (page - 1) * ORDERS_PAGE_SIZE;
  const end = start + ORDERS_PAGE_SIZE - 1;
  const selectedFields: string = canViewFinance
    ? "id,order_number,customer_name_snapshot,company_name_snapshot,delivery_at,factory_date,ship_out_time,delivery_status,is_sent_to_factory,currency,bubble_created_at,created_at,grand_total,outstanding,order_status_legacy_ids"
    : "id,order_number,customer_name_snapshot,company_name_snapshot,delivery_at,factory_date,ship_out_time,delivery_status,is_sent_to_factory,currency,bubble_created_at,created_at,order_status_legacy_ids";
  let catalog: ConfiguredOrderStatus[] | undefined;
  const loadCatalog = async () => {
    catalog ??= await fetchOrderStatusCatalog();
    return catalog;
  };

  let query = supabase
    .from("orders")
    .select(selectedFields, { count: "exact" })
    .eq("document_type", preset === "pending" ? "unconfirmed" : "order")
    .is("archived_at", null)
    // Bubble Created Date (fallback to DB created_at).
    .order("bubble_created_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(start, end);

  const term = safeSearchTerm(search);
  if (term) {
    query = query.or(
      `order_number.ilike.%${term}%,customer_name_snapshot.ilike.%${term}%,company_name_snapshot.ilike.%${term}%`,
    );
  }

  if (isOrderTagQueuePreset(preset)) {
    const tagCatalog = await loadCatalog();
    const legacyIds = catalogLegacyIdsForNames(
      tagCatalog,
      ORDER_TAG_QUEUE_NAMES[preset],
    );
    if (!legacyIds.length) {
      return { items: [], total: 0 };
    }
    query = query.overlaps("order_status_legacy_ids", legacyIds);
  } else if (preset === "kitchen") {
    query = query.eq("is_sent_to_factory", true);
  } else if (preset === "unpaid") {
    query = query.gt("outstanding", 0);
  } else if (preset === "delivered-unpaid") {
    query = query
      .in("delivery_status", ["己送達", "已送達"])
      .gt("outstanding", 0);
  } else if (preset === "shopify-pending") {
    query = query.eq("is_shopify_order", true);
  }

  query = applyStatusFilter(query, status, preset);

  const [{ data, count, error }, resolvedCatalog] = await Promise.all([
    query,
    loadCatalog(),
  ]);
  if (error) throw error;

  return {
    items: ((data ?? []) as unknown as OrderRow[]).map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      customerName: row.customer_name_snapshot,
      companyName: row.company_name_snapshot,
      deliveryAt: row.delivery_at,
      factoryDate: row.factory_date,
      shipOutTime: row.ship_out_time,
      deliveryStatus: row.delivery_status,
      isSentToFactory: row.is_sent_to_factory,
      grandTotal: optionalAmount(row.grand_total),
      outstanding: optionalAmount(row.outstanding),
      currency: row.currency || "HKD",
      createdAt: row.bubble_created_at || row.created_at,
      statuses: resolveOrderStatuses(row.order_status_legacy_ids, resolvedCatalog),
    })),
    total: count ?? 0,
  };
}
