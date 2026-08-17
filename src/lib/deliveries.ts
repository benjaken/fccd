import { supabase } from "@/lib/supabase";

export const DELIVERIES_PAGE_SIZE = 15;
export const DELIVERY_EXPORT_PAGE_SIZE = 200;

export type DeliveryListFilters = {
  page: number;
  pageSize?: number;
  search: string;
  startDate: string;
  endDate: string;
  motorcadeId: string;
  shippingMethodId: string;
};

export type DeliverySurcharge = {
  name: string | null;
  amount: number | null;
};

export type DeliveryListItem = {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
  address: string | null;
  deliveryAt: string | null;
  deliveryTime: string | null;
  districtName: string | null;
  motorcadeId: string | null;
  motorcadeName: string | null;
  shippingMethodId: string | null;
  shippingMethodName: string | null;
  basicFee: number | null;
  totalFee: number | null;
  surchargeAmount: number | null;
  surcharges: DeliverySurcharge[];
  grandTotal: number | null;
  deliveryStatus: string | null;
  takenAt: string | null;
  fulfilledAt: string | null;
  imageReferences: string[];
};

export type DeliveryLookupOption = {
  id: string;
  name: string;
};

export type DeliveryListResult = {
  items: DeliveryListItem[];
  total: number;
};

export type DeliveryExportRow = {
  orderNumber: string;
  deliveryDate: string;
  deliveryTime: string;
  customerName: string;
  customerPhone: string;
  district: string;
  address: string;
  shippingMethod: string;
  fleet: string;
};

type Nested<T> = T | T[] | null | undefined;

type NamedRow = {
  name?: string | null;
  display_name?: string | null;
  short_name?: string | null;
};

type SurchargeRow = {
  amount?: number | string | null;
  delivery_surcharge_types?: Nested<NamedRow>;
};

type OrderRow = {
  id?: string | null;
  order_number?: string | null;
  customer_name_snapshot?: string | null;
  contact_number_a_snapshot?: string | null;
  contact_number_b_snapshot?: string | null;
  shipping_address_snapshot?: string | null;
  shipping_method_id?: string | null;
  grand_total?: number | string | null;
  delivery_time?: string | null;
  ship_out_time?: string | null;
  delivery_status?: string | null;
  shipping_methods?: Nested<NamedRow>;
};

type DeliveryRow = {
  id: string;
  delivery_at: string | null;
  delivery_time?: string | null;
  ship_out_time: string | null;
  delivery_status: string | null;
  basic_fee: number | string | null;
  total_fee: number | string | null;
  taken_at: string | null;
  fulfilled_at: string | null;
  image_references: string[] | null;
  motorcade_id: string | null;
  shipping_method_id: string | null;
  orders?: Nested<OrderRow>;
  delivery_districts?: Nested<NamedRow>;
  shipping_methods?: Nested<NamedRow>;
  delivery_teams?: Nested<NamedRow>;
  delivery_surcharges?: Nested<SurchargeRow>;
};

const DELIVERY_SELECT = [
  "id",
  "delivery_at",
  "delivery_time",
  "ship_out_time",
  "delivery_status",
  "basic_fee",
  "total_fee",
  "taken_at",
  "fulfilled_at",
  "image_references",
  "motorcade_id",
  "shipping_method_id",
  "orders!inner(id,order_number,customer_name_snapshot,contact_number_a_snapshot,contact_number_b_snapshot,shipping_address_snapshot,shipping_method_id,grand_total,delivery_time,ship_out_time,delivery_status,shipping_methods(name,display_name))",
  "delivery_districts!district_id(name)",
  "shipping_methods!shipping_method_id(name,display_name)",
  "delivery_teams!motorcade_id(name,short_name)",
  "delivery_surcharges(amount,delivery_surcharge_types!surcharge_type_id(name))",
].join(",");

function nestedRecord<T>(value: Nested<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function nestedList<T>(value: Nested<T>): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function displayName(value: Nested<NamedRow>): string | null {
  const row = nestedRecord(value);
  const name =
    row?.display_name?.trim() ||
    row?.short_name?.trim() ||
    row?.name?.trim() ||
    "";
  return name || null;
}

function teamName(value: Nested<NamedRow>): string | null {
  const row = nestedRecord(value);
  const name = row?.name?.trim() || row?.short_name?.trim() || "";
  return name || null;
}

export function clockFromValue(
  value: string | null | undefined,
  timeZone = "Asia/Hong_Kong",
) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const looksLikeDateTime = /^\d{4}-\d{2}-\d{2}(?:[T\s]|$)/.test(trimmed);
  if (!looksLikeDateTime) return trimmed;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return trimmed;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = (parts.find((part) => part.type === "hour")?.value ?? "").padStart(
    2,
    "0",
  );
  const minute = (
    parts.find((part) => part.type === "minute")?.value ?? ""
  ).padStart(2, "0");
  if (hour === "00" || hour === "24") {
    if (minute === "00") return null;
  }
  return `${hour === "24" ? "00" : hour}:${minute}`;
}

export function canAssignDeliveryFleet(role: string | null | undefined) {
  return (
    role === "Super Admin" ||
    role === "Admin" ||
    role === "Accounting" ||
    role === "Factory"
  );
}

function formatContactPhones(
  primary?: string | null,
  secondary?: string | null,
) {
  const first = primary?.trim() || "";
  const second = secondary?.trim() || "";
  if (first && second && first !== second) return `${first} / ${second}`;
  return first || second || null;
}

function optionalAmount(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function safeSearchTerm(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s@+\-#]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hongKongDateInputValue(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function hongKongMonthStart(now = new Date()) {
  return `${hongKongDateInputValue(now).slice(0, 7)}-01`;
}

export function nextCalendarDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

export function hongKongDayStart(isoDate: string) {
  return `${isoDate}T00:00:00+08:00`;
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function mapDeliveryRow(row: DeliveryRow): DeliveryListItem {
  const order = nestedRecord(row.orders);
  const surcharges = nestedList(row.delivery_surcharges).map((item) => ({
    name: displayName(item.delivery_surcharge_types),
    amount: optionalAmount(item.amount),
  }));
  const surchargeSum = surcharges.reduce(
    (total, item) => total + (item.amount ?? 0),
    0,
  );
  const basicFee = optionalAmount(row.basic_fee);
  const totalFee = optionalAmount(row.total_fee);
  const surchargeAmount =
    surcharges.length > 0
      ? surchargeSum
      : basicFee !== null && totalFee !== null
        ? Math.max(0, totalFee - basicFee)
        : null;

  return {
    id: row.id,
    orderId: order?.id ?? null,
    orderNumber: order?.order_number ?? null,
    customerName: order?.customer_name_snapshot ?? null,
    customerPhone: formatContactPhones(
      order?.contact_number_a_snapshot,
      order?.contact_number_b_snapshot,
    ),
    address: order?.shipping_address_snapshot ?? null,
    deliveryAt: row.delivery_at,
    deliveryTime:
      clockFromValue(row.delivery_time) ||
      clockFromValue(order?.delivery_time) ||
      clockFromValue(row.ship_out_time) ||
      clockFromValue(order?.ship_out_time) ||
      clockFromValue(row.delivery_at),
    districtName: displayName(row.delivery_districts),
    motorcadeId: row.motorcade_id,
    motorcadeName: teamName(row.delivery_teams),
    shippingMethodId:
      row.shipping_method_id || order?.shipping_method_id || null,
    shippingMethodName:
      displayName(row.shipping_methods) ||
      displayName(order?.shipping_methods),
    basicFee,
    totalFee,
    surchargeAmount,
    surcharges,
    grandTotal: optionalAmount(order?.grand_total),
    deliveryStatus: row.delivery_status || order?.delivery_status || null,
    takenAt: row.taken_at,
    fulfilledAt: row.fulfilled_at,
    imageReferences: (row.image_references ?? []).filter(Boolean),
  };
}

export function feeSharePercent(item: DeliveryListItem) {
  if (item.totalFee === null || !item.grandTotal || item.grandTotal <= 0) {
    return null;
  }
  return (item.totalFee / item.grandTotal) * 100;
}

export function isDeliveredStatus(status: string | null) {
  return status === "己送達" || status === "已送達";
}

export function isPickedUpStatus(status: string | null) {
  return status === "已取" || isDeliveredStatus(status);
}

export function isPendingPickupStatus(status: string | null) {
  return status === "待取貨";
}

export function hasDeliveryPhotos(item: Pick<DeliveryListItem, "imageReferences">) {
  return item.imageReferences.some((src) => src.trim().length > 0);
}

function applyDeliveryFilters<
  T extends {
    not: (column: string, operator: string, value: unknown) => T;
    gte: (column: string, value: string) => T;
    lt: (column: string, value: string) => T;
    eq: (column: string, value: string) => T;
    or: (
      filters: string,
      options?: { referencedTable?: string; foreignTable?: string },
    ) => T;
  },
>(
  query: T,
  {
    search,
    startDate,
    endDate,
    motorcadeId,
    shippingMethodId,
  }: Omit<DeliveryListFilters, "page" | "pageSize">,
) {
  let next = query.not("order_id", "is", null);

  if (startDate) {
    next = next.gte("delivery_at", hongKongDayStart(startDate));
  }
  if (endDate) {
    next = next.lt("delivery_at", hongKongDayStart(nextCalendarDate(endDate)));
  }
  if (motorcadeId) {
    next = next.eq("motorcade_id", motorcadeId);
  }
  if (shippingMethodId) {
    next = next.or(`shipping_method_id.eq.${shippingMethodId}`, {
      referencedTable: "orders",
    });
  }

  const term = safeSearchTerm(search);
  if (term) {
    next = next.or(
      `order_number.ilike.%${term}%,customer_name_snapshot.ilike.%${term}%,contact_number_a_snapshot.ilike.%${term}%,contact_number_b_snapshot.ilike.%${term}%,shipping_address_snapshot.ilike.%${term}%`,
      { referencedTable: "orders" },
    );
  }

  return next;
}

export async function fetchDeliveries({
  page,
  pageSize = DELIVERIES_PAGE_SIZE,
  search,
  startDate,
  endDate,
  motorcadeId,
  shippingMethodId,
}: DeliveryListFilters): Promise<DeliveryListResult> {
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;
  const query = applyDeliveryFilters(
    supabase
      .from("deliveries")
      .select(DELIVERY_SELECT, { count: "exact" })
      .order("delivery_at", { ascending: true, nullsFirst: false })
      .order("ship_out_time", { ascending: true, nullsFirst: false })
      .range(start, end),
    { search, startDate, endDate, motorcadeId, shippingMethodId },
  );

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    items: ((data ?? []) as unknown as DeliveryRow[]).map(mapDeliveryRow),
    total: count ?? 0,
  };
}

export async function fetchDeliveryLookups(): Promise<{
  teams: DeliveryLookupOption[];
  shippingMethods: DeliveryLookupOption[];
}> {
  const [teamsResult, methodsResult] = await Promise.all([
    supabase
      .from("delivery_teams")
      .select("id,name,short_name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("shipping_methods")
      .select("id,name,display_name,display_order")
      .eq("is_active", true)
      .is("archived_at", null)
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("name"),
  ]);
  if (teamsResult.error) throw teamsResult.error;
  if (methodsResult.error) throw methodsResult.error;

  return {
    teams: (teamsResult.data ?? []).map((row) => ({
      id: row.id as string,
      name:
        (row.name as string | null)?.trim() ||
        (row.short_name as string | null)?.trim() ||
        (row.id as string),
    })),
    shippingMethods: (methodsResult.data ?? []).map((row) => ({
      id: row.id as string,
      name:
        (row.display_name as string | null)?.trim() ||
        (row.name as string | null)?.trim() ||
        (row.id as string),
    })),
  };
}

export async function fetchDeliveryExportRows(
  filters: Omit<DeliveryListFilters, "page" | "pageSize">,
): Promise<DeliveryListItem[]> {
  const items: DeliveryListItem[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (items.length < total) {
    const result = await fetchDeliveries({
      ...filters,
      page,
      pageSize: DELIVERY_EXPORT_PAGE_SIZE,
    });
    total = result.total;
    items.push(...result.items);
    if (result.items.length === 0) break;
    page += 1;
  }

  return items;
}

export async function assignDeliveryMotorcade(
  deliveryId: string,
  motorcadeId: string | null,
) {
  const { error } = await supabase.rpc("assign_delivery_motorcade", {
    p_delivery_id: deliveryId,
    p_motorcade_id: motorcadeId,
  });
  if (error) throw error;
}

export async function cancelPendingDelivery(deliveryId: string) {
  const { error } = await supabase.rpc("cancel_pending_delivery", {
    p_delivery_id: deliveryId,
  });
  if (error) throw error;
}

export function buildDeliveryExportCsv(
  rows: DeliveryExportRow[],
  headers: DeliveryExportRow,
) {
  return [headers, ...rows]
    .map((row) =>
      [
        row.orderNumber,
        row.deliveryDate,
        row.deliveryTime,
        row.customerName,
        row.customerPhone,
        row.district,
        row.address,
        row.shippingMethod,
        row.fleet,
      ]
        .map((value) => csvCell(value))
        .join(","),
    )
    .join("\n");
}

export function toDeliveryExportRow(
  item: DeliveryListItem,
  empty: string,
  formatDate: (value: string | null) => string,
): DeliveryExportRow {
  return {
    orderNumber: item.orderNumber?.trim() || empty,
    deliveryDate: formatDate(item.deliveryAt),
    deliveryTime: item.deliveryTime?.trim() || empty,
    customerName: item.customerName?.trim() || empty,
    customerPhone: item.customerPhone?.trim() || empty,
    district: item.districtName?.trim() || empty,
    address: item.address?.trim() || empty,
    shippingMethod: item.shippingMethodName?.trim() || empty,
    fleet: item.motorcadeName?.trim() || empty,
  };
}

export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
