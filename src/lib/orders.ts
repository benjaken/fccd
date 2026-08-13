import { supabase } from "@/lib/supabase";

export const ORDERS_PAGE_SIZE = 10;

export type OrderPreset =
  | "all"
  | "pending"
  | "unpaid"
  | "delivered-unpaid";

export type OrderStatusFilter =
  | ""
  | "confirmed"
  | "preparing"
  | "ready"
  | "shipping"
  | "completed";

export type OrderListItem = {
  id: string;
  orderNumber: string | null;
  customerName: string | null;
  companyName: string | null;
  deliveryAt: string | null;
  shipOutTime: string | null;
  deliveryStatus: string | null;
  isSentToFactory: boolean | null;
  grandTotal: number | null;
  outstanding: number | null;
  currency: string;
  updatedAt: string;
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
  ship_out_time: string | null;
  delivery_status: string | null;
  is_sent_to_factory: boolean | null;
  grand_total?: number | string | null;
  outstanding?: number | string | null;
  currency: string | null;
  updated_at: string;
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
>(query: T, status: OrderStatusFilter) {
  switch (status) {
    case "completed":
      return query.in("delivery_status", ["己送達", "已送達"]);
    case "shipping":
      return query.eq("delivery_status", "送貨途中");
    case "ready":
      return query.eq("delivery_status", "待取貨");
    case "preparing":
      return query.eq("is_sent_to_factory", true).or(
        'delivery_status.is.null,delivery_status.not.in.("己送達","已送達","送貨途中","待取貨")',
      );
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
    ? "id,order_number,customer_name_snapshot,company_name_snapshot,delivery_at,ship_out_time,delivery_status,is_sent_to_factory,currency,updated_at,grand_total,outstanding"
    : "id,order_number,customer_name_snapshot,company_name_snapshot,delivery_at,ship_out_time,delivery_status,is_sent_to_factory,currency,updated_at";
  let query = supabase
    .from("orders")
    .select(selectedFields, { count: "exact" })
    .eq("document_type", preset === "pending" ? "unconfirmed" : "order")
    .is("archived_at", null)
    .order("delivery_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .range(start, end);

  const term = safeSearchTerm(search);
  if (term) {
    query = query.or(
      `order_number.ilike.%${term}%,customer_name_snapshot.ilike.%${term}%,company_name_snapshot.ilike.%${term}%`,
    );
  }

  if (preset === "unpaid") {
    query = query.gt("outstanding", 0);
  } else if (preset === "delivered-unpaid") {
    query = query
      .in("delivery_status", ["己送達", "已送達"])
      .gt("outstanding", 0);
  }

  query = applyStatusFilter(query, status);

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    items: ((data ?? []) as unknown as OrderRow[]).map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      customerName: row.customer_name_snapshot,
      companyName: row.company_name_snapshot,
      deliveryAt: row.delivery_at,
      shipOutTime: row.ship_out_time,
      deliveryStatus: row.delivery_status,
      isSentToFactory: row.is_sent_to_factory,
      grandTotal: optionalAmount(row.grand_total),
      outstanding: optionalAmount(row.outstanding),
      currency: row.currency || "HKD",
      updatedAt: row.updated_at,
    })),
    total: count ?? 0,
  };
}
