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
import {
  fetchManualTodosForOrders,
  findOrdersWithOrderTags,
  findOrdersWithManualTodos,
  type OrderListEnhancementFilters,
  type OrderListManualTodo,
} from "@/lib/order-list-enhancement";

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
  | "shopify-pending"
  | "not-sent-factory";

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
  email: string | null;
  deliveryAt: string | null;
  deliveryTime: string | null;
  factoryDate: string | null;
  shipOutTime: string | null;
  deliveryStatus: string | null;
  isSentToFactory: boolean | null;
  doNotSendToFactory?: boolean;
  isAssignedToFleet?: boolean;
  grandTotal: number | null;
  outstanding: number | null;
  currency: string;
  createdAt: string;
  statuses: OrderStatusView[];
  statusLegacyIds?: string[];
  tags?: OrderStatusView[];
  shopifyOrderId: number | null;
  shopifyStoreDomain: string | null;
  channelName: string | null;
  districtName: string | null;
  address: string | null;
  customerNote?: string | null;
  factoryPackingNote?: string | null;
  shippingMethodName?: string | null;
  contactPhone: string | null;
  quantity: number;
  manualTodos: OrderListManualTodo[];
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
} & OrderListEnhancementFilters;

type OrderRow = {
  id: string;
  order_number: string | null;
  customer_name_snapshot: string | null;
  company_name_snapshot: string | null;
  email_snapshot: string | null;
  delivery_at: string | null;
  delivery_time: string | null;
  factory_date: string | null;
  ship_out_time: string | null;
  delivery_status: string | null;
  is_sent_to_factory: boolean | null;
  do_not_send_to_factory: boolean | null;
  grand_total?: number | string | null;
  outstanding?: number | string | null;
  currency: string | null;
  bubble_created_at: string | null;
  created_at: string;
  order_status_legacy_ids: string[] | null;
  order_tag_assignments: Array<{
    order_tags:
      | { name: string | null }
      | Array<{ name: string | null }>
      | null;
  }> | null;
  shopify_order_id: number | null;
  shopify_stores: {
    shop_domain: string | null;
  } | null;
  channels: { name: string | null } | null;
  shipping_methods:
    | { name: string | null; display_name: string | null }
    | Array<{ name: string | null; display_name: string | null }>
    | null;
  deliveries: Array<{
    motorcade_id: string | null;
    delivery_time: string | null;
    ship_out_time: string | null;
    delivery_districts:
      | { name: string | null }
      | Array<{ name: string | null }>
      | null;
  }> | null;
  shipping_address_snapshot: string | null;
  customer_note_snapshot: string | null;
  factory_packing_note: string | null;
  contact_number_a_snapshot: string | null;
  order_lines: Array<{ quantity: number | string | null; is_void: boolean | null }> | null;
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

function orderShippingMethodName(value: OrderRow["shipping_methods"]) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.display_name?.trim() || row?.name?.trim() || null;
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
  deliveryDate,
  deliveryStart,
  deliveryEnd,
  brandIds = [],
  orderTagIds = [],
  manualTodoKeys = [],
  deliverySort,
}: OrderListFilters): Promise<OrderListResult> {
  const start = (page - 1) * ORDERS_PAGE_SIZE;
  const end = start + ORDERS_PAGE_SIZE - 1;
  const selectedFields: string = canViewFinance
    ? "id,order_number,customer_name_snapshot,company_name_snapshot,email_snapshot,contact_number_a_snapshot,shipping_address_snapshot,customer_note_snapshot,factory_packing_note,delivery_at,delivery_time,factory_date,ship_out_time,delivery_status,is_sent_to_factory,do_not_send_to_factory,currency,bubble_created_at,created_at,grand_total,outstanding,order_status_legacy_ids,order_tag_assignments(order_tags(name)),shopify_order_id,shopify_stores(shop_domain),channels(name),shipping_methods(name,display_name),deliveries(motorcade_id,delivery_time,ship_out_time,delivery_districts!district_id(name)),order_lines(quantity,is_void)"
    : "id,order_number,customer_name_snapshot,company_name_snapshot,email_snapshot,contact_number_a_snapshot,shipping_address_snapshot,customer_note_snapshot,factory_packing_note,delivery_at,delivery_time,factory_date,ship_out_time,delivery_status,is_sent_to_factory,do_not_send_to_factory,currency,bubble_created_at,created_at,order_status_legacy_ids,order_tag_assignments(order_tags(name)),shopify_order_id,shopify_stores(shop_domain),channels(name),shipping_methods(name,display_name),deliveries(motorcade_id,delivery_time,ship_out_time,delivery_districts!district_id(name)),order_lines(quantity,is_void)";
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
    .order("delivery_at", { ascending: deliverySort === "asc", nullsFirst: false })
    .order("bubble_created_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(start, end);

  const term = safeSearchTerm(search);
  if (term) {
    query = query.or(
      `order_number.ilike.%${term}%,customer_name_snapshot.ilike.%${term}%,company_name_snapshot.ilike.%${term}%,contact_number_a_snapshot.ilike.%${term}%,shipping_address_snapshot.ilike.%${term}%`,
    );
  }

  if (brandIds.length) query = query.in("channel_id", brandIds);
  const taggedOrderIds = await findOrdersWithOrderTags(orderTagIds);
  if (taggedOrderIds !== null) {
    if (!taggedOrderIds.length) return { items: [], total: 0 };
    query = query.in("id", taggedOrderIds);
  }
  if (deliveryDate) {
    query = query
      .gte("delivery_at", `${deliveryDate}T00:00:00+08:00`)
      .lt("delivery_at", `${deliveryDate}T00:00:00+08:00`.replace(deliveryDate, nextDate(deliveryDate)));
  } else if (deliveryStart && deliveryEnd) {
    query = query
      .gte("delivery_at", `${deliveryStart}T00:00:00+08:00`)
      .lt("delivery_at", `${nextDate(deliveryEnd)}T00:00:00+08:00`);
  }

  const manualTodoOrderIds = await findOrdersWithManualTodos(manualTodoKeys);
  if (manualTodoOrderIds !== null) {
    if (!manualTodoOrderIds.length) return { items: [], total: 0 };
    query = query.in("id", manualTodoOrderIds);
  }

  if (preset === "kitchen-notes") {
    query = query
      .not("factory_packing_note", "is", null)
      .neq("factory_packing_note", "");
  } else if (isOrderTagQueuePreset(preset)) {
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
    // Only orders newly created by the Shopify sync are review candidates.
    // Legacy Bubble orders merely linked to a Shopify ID are already
    // confirmed/completed and must stay out of this queue.
    query = query
      .eq("is_shopify_order", true)
      .eq("source_system", "shopify")
      .is("delivery_status", null)
      .eq("do_not_send_to_factory", false)
      .or("is_sent_to_factory.is.null,is_sent_to_factory.eq.false");
  } else if (preset === "not-sent-factory") {
    // Only an explicit false is actionable. Migrated legacy orders often have
    // a null flag, which does not mean they still need to be sent.
    query = query
      .eq("is_sent_to_factory", false)
      .eq("do_not_send_to_factory", false);
  }

  query = applyStatusFilter(query, status, preset);

  const [{ data, count, error }, resolvedCatalog] = await Promise.all([
    query,
    loadCatalog(),
  ]);
  if (error) throw error;

  const rows = (data ?? []) as unknown as OrderRow[];
  const manualTodos = await fetchManualTodosForOrders(rows.map((row) => row.id));
  const todosByOrder = new Map<string, OrderListManualTodo[]>();
  for (const todo of manualTodos) {
    todosByOrder.set(todo.orderId, [...(todosByOrder.get(todo.orderId) ?? []), todo]);
  }
  return {
    items: rows.map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      customerName: row.customer_name_snapshot,
      companyName: row.company_name_snapshot,
      email: row.email_snapshot,
      deliveryAt: row.delivery_at,
      deliveryTime:
        row.delivery_time || firstDeliveryValue(row.deliveries, "delivery_time"),
      factoryDate: row.factory_date,
      shipOutTime:
        row.ship_out_time || firstDeliveryValue(row.deliveries, "ship_out_time"),
      deliveryStatus: row.delivery_status,
      isSentToFactory: row.is_sent_to_factory,
      doNotSendToFactory: row.do_not_send_to_factory === true,
      isAssignedToFleet: (row.deliveries ?? []).some(
        (delivery) => Boolean(delivery.motorcade_id),
      ),
      grandTotal: optionalAmount(row.grand_total),
      outstanding: optionalAmount(row.outstanding),
      currency: row.currency || "HKD",
      createdAt: row.bubble_created_at || row.created_at,
      statuses: resolveOrderStatuses(row.order_status_legacy_ids, resolvedCatalog),
      statusLegacyIds: row.order_status_legacy_ids ?? [],
      tags: orderTagsFromAssignments(row.order_tag_assignments),
      shopifyOrderId: row.shopify_order_id,
      shopifyStoreDomain: row.shopify_stores?.shop_domain ?? null,
      channelName: row.channels?.name ?? null,
      districtName: deliveryDistrictName(row.deliveries),
      address: row.shipping_address_snapshot,
      customerNote: row.customer_note_snapshot,
      factoryPackingNote: row.factory_packing_note,
      shippingMethodName: orderShippingMethodName(row.shipping_methods),
      contactPhone: row.contact_number_a_snapshot,
      quantity: (row.order_lines ?? []).reduce(
        (sum, line) => sum + (line.is_void ? 0 : optionalAmount(line.quantity) ?? 0),
        0,
      ),
      manualTodos: todosByOrder.get(row.id) ?? [],
    })),
    total: count ?? 0,
  };
}

function deliveryDistrictName(deliveries: OrderRow["deliveries"]) {
  const district = deliveries?.[0]?.delivery_districts;
  const value = Array.isArray(district) ? district[0]?.name : district?.name;
  return value?.trim() || null;
}

function firstDeliveryValue(
  deliveries: OrderRow["deliveries"],
  key: "delivery_time" | "ship_out_time",
) {
  for (const delivery of deliveries ?? []) {
    const value = delivery[key]?.trim();
    if (value) return value;
  }
  return null;
}

function orderTagsFromAssignments(assignments: OrderRow["order_tag_assignments"]) {
  return (assignments ?? []).flatMap((assignment) => {
    const tag = Array.isArray(assignment.order_tags)
      ? assignment.order_tags[0]
      : assignment.order_tags;
    const name = tag?.name?.trim();
    return name ? [{ name, color: null }] : [];
  });
}


/** A cancellation request may only begin while dispatch is awaiting acceptance. */
export function isOrderAwaitingAcceptance(
  deliveryStatus: string | null | undefined,
) {
  const status = (deliveryStatus ?? "").trim();
  return status === "\u5f85\u63a5\u55ae" && !status.includes("\u53d6\u6d88");
}

export async function updateOrderStatusSelections(
  orderId: string,
  statusLegacyIds: readonly string[],
) {
  const { error } = await supabase.rpc("update_order_list_statuses", {
    p_order_id: orderId,
    p_status_legacy_ids: [...statusLegacyIds],
  });
  if (error) throw error;
}

function nextDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, (day ?? 1) + 1))
    .toISOString()
    .slice(0, 10);
}
