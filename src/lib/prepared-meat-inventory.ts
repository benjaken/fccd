import { supabase } from "@/lib/supabase";

export const PREPARED_MEAT_MOVEMENTS_PAGE_SIZE = 15;
export const PREPARED_MEAT_FIRST_DATA_YEAR = 2023;

export type PreparedMeatItemOption = {
  id: string;
  sku: string | null;
  name: string;
  unit: string | null;
  sortOrder: number | null;
  isActive: boolean;
};

export type PreparedMeatMovementKind = "inbound" | "outbound" | "both" | "none";

export type PreparedMeatMovementRow = {
  id: string;
  movementAt: string | null;
  productName: string;
  shopId: string | null;
  shopName: string | null;
  inboundPackages: number | null;
  outboundPackages: number | null;
  balancePackages: number;
  remarks: string | null;
  kind: PreparedMeatMovementKind;
};

type ItemRow = {
  id: string;
  sku: string | null;
  name: string;
  unit: string | null;
  sort_order: number | string | null;
  is_active: boolean | null;
};

export type PreparedMeatMovementRecord = {
  id: string;
  movement_at: string | null;
  inbound_packages: number | string | null;
  outbound_packages: number | string | null;
  remarks: string | null;
  bubble_created_at: string | null;
  created_at: string;
  meat_customer_id: string | null;
  meat_customers:
    | { id: string; name: string | null }
    | { id: string; name: string | null }[]
    | null;
};

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function preparedMeatMovementKind(
  inboundPackages: number | null,
  outboundPackages: number | null,
): PreparedMeatMovementKind {
  const hasInbound = (inboundPackages ?? 0) !== 0;
  const hasOutbound = (outboundPackages ?? 0) !== 0;
  if (hasInbound && hasOutbound) return "both";
  if (hasInbound) return "inbound";
  if (hasOutbound) return "outbound";
  return "none";
}

function relatedShop(
  row: PreparedMeatMovementRecord,
): { id: string; name: string } | null {
  const nested = Array.isArray(row.meat_customers)
    ? row.meat_customers[0]
    : row.meat_customers;
  const id = nested?.id ?? row.meat_customer_id;
  if (!id) return null;
  const name = nested?.name?.trim();
  return { id, name: name || id };
}

function movementSortKey(row: PreparedMeatMovementRecord) {
  return row.movement_at || row.bubble_created_at || row.created_at || "";
}

/** Current calendar year in Asia/Hong_Kong. */
export function currentHongKongYear(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Hong_Kong",
      year: "numeric",
    }).format(now),
  );
}

export function preparedMeatYearOptions(now = new Date()) {
  const currentYear = currentHongKongYear(now);
  return Array.from(
    { length: currentYear - PREPARED_MEAT_FIRST_DATA_YEAR + 1 },
    (_, index) => currentYear - index,
  );
}

export function hongKongYearBounds(year: number) {
  return {
    start: `${year}-01-01T00:00:00+08:00`,
    end: `${year + 1}-01-01T00:00:00+08:00`,
  };
}

/** YYYY-MM key for a timestamp in Asia/Hong_Kong. */
export function hongKongYearMonthKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) return "";
  return `${year}-${month}`;
}

export function withPreparedMeatRunningBalance(
  rows: PreparedMeatMovementRecord[],
  productName: string,
  openingPackages = 0,
): PreparedMeatMovementRow[] {
  const chronological = [...rows].sort((a, b) => {
    const left = movementSortKey(a);
    const right = movementSortKey(b);
    if (left === right) return a.id.localeCompare(b.id);
    return left < right ? -1 : 1;
  });

  let balance = openingPackages;
  const withBalance = chronological.map((row) => {
    const inbound = toNumber(row.inbound_packages);
    const outbound = toNumber(row.outbound_packages);
    balance += (inbound ?? 0) - (outbound ?? 0);
    const shop = relatedShop(row);
    return {
      id: row.id,
      movementAt: row.movement_at || row.bubble_created_at || row.created_at,
      productName,
      shopId: shop?.id ?? null,
      shopName: shop?.name ?? null,
      inboundPackages: inbound,
      outboundPackages: outbound,
      balancePackages: balance,
      remarks: row.remarks,
      kind: preparedMeatMovementKind(inbound, outbound),
    };
  });

  return withBalance.reverse();
}

export async function fetchPreparedMeatItems(): Promise<PreparedMeatItemOption[]> {
  const { data, error } = await supabase
    .from("prepared_meat_items")
    .select("id,sku,name,unit,sort_order,is_active")
    .is("archived_at", null)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as ItemRow[]).map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    sortOrder: toNumber(row.sort_order),
    isActive: row.is_active !== false,
  }));
}

export async function updatePreparedMeatItemFlags(
  itemId: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("update_prepared_meat_item_flags", {
    p_item_id: itemId,
    p_is_active: isActive,
  });
  if (error) throw error;
}

export async function fetchPreparedMeatMovementsForItem(
  itemId: string,
  productName: string,
  year: number = currentHongKongYear(),
): Promise<PreparedMeatMovementRow[]> {
  const { start, end } = hongKongYearBounds(year);

  const [openingResult, yearResult] = await Promise.all([
    supabase
      .from("prepared_meat_stock_movements")
      .select("inbound_packages,outbound_packages,movement_at")
      .eq("prepared_meat_item_id", itemId)
      .lt("movement_at", start),
    supabase
      .from("prepared_meat_stock_movements")
      .select(
        "id,movement_at,inbound_packages,outbound_packages,remarks,bubble_created_at,created_at,meat_customer_id,meat_customers(id,name)",
      )
      .eq("prepared_meat_item_id", itemId)
      .gte("movement_at", start)
      .lt("movement_at", end)
      .order("movement_at", { ascending: true, nullsFirst: false })
      .order("bubble_created_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
  ]);

  if (openingResult.error) throw openingResult.error;
  if (yearResult.error) throw yearResult.error;

  let opening = 0;
  for (const row of openingResult.data ?? []) {
    opening +=
      (toNumber(row.inbound_packages) ?? 0) -
      (toNumber(row.outbound_packages) ?? 0);
  }

  return withPreparedMeatRunningBalance(
    (yearResult.data ?? []) as PreparedMeatMovementRecord[],
    productName,
    opening,
  );
}

export const GUIHUA_CUSTOMER_MARKER = "桂花小幸";

export function canSelectPreparedMeatShippingMethod(
  customerName: string | null | undefined,
) {
  return (customerName ?? "").includes(GUIHUA_CUSTOMER_MARKER);
}

export function meatCustomerOptionLabel(row: {
  customerCode: string | null;
  name: string;
}) {
  const code = row.customerCode?.trim();
  return code ? `${code} - ${row.name}` : row.name;
}

/** Keep digits and at most one decimal while typing. */
export function coercePreparedMeatQuantityInput(value: string): string {
  const normalized = value
    .replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xff10))
    .replace(/．/g, ".");
  const cleaned = normalized.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const dot = cleaned.indexOf(".");
  const intDigits = (dot === -1 ? cleaned : cleaned.slice(0, dot)).replace(
    /^0+(?=\d)/,
    "",
  );
  const frac =
    dot === -1 ? null : cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 3);
  const intPart = intDigits === "" ? (frac === null ? "" : "0") : intDigits;
  if (frac === null) return intPart;
  return `${intPart}.${frac}`;
}

export function preparedMeatOrderYearMonth(dateValue: string) {
  return dateValue.slice(0, 7).replace("-", "");
}

export function formatPreparedMeatOrderNumber(yearMonth: string, sequence: number) {
  return `R - ${yearMonth} - ${sequence}`;
}

export function nextPreparedMeatOrderSequence(orderNumbers: Array<string | null>) {
  let max = 0;
  for (const value of orderNumbers) {
    const match = String(value ?? "").match(/R - \d{6} - (\d+)$/);
    const sequence = match ? Number.parseInt(match[1]!, 10) : Number.NaN;
    if (Number.isFinite(sequence) && sequence > max) max = sequence;
  }
  return max + 1;
}

export type MeatShippingMethodOption = {
  id: string;
  name: string;
};

export async function fetchMeatShippingMethods(): Promise<
  MeatShippingMethodOption[]
> {
  const { data, error } = await supabase
    .from("meat_shipping_methods")
    .select("id,name")
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as MeatShippingMethodOption[]).filter((row) =>
    Boolean(row.name?.trim()),
  );
}

export async function fetchNextPreparedMeatOrderNumber(
  shippingDate: string,
): Promise<string> {
  const yearMonth = preparedMeatOrderYearMonth(shippingDate);
  const prefix = `R - ${yearMonth} - `;
  const { data, error } = await supabase
    .from("meat_orders")
    .select("order_number")
    .like("order_number", `${prefix}%`);

  if (error) throw error;
  return formatPreparedMeatOrderNumber(
    yearMonth,
    nextPreparedMeatOrderSequence(
      (data ?? []).map((row) => row.order_number as string | null),
    ),
  );
}

export type PreparedMeatOutboundLineInput = {
  preparedMeatItemId: string;
  quantity: number;
  remarks?: string | null;
};

export type PreparedMeatOutboundInput = {
  customerId: string;
  shippingMethodId?: string | null;
  orderNumber: string;
  shippingDate: string;
  remarks?: string | null;
  lines: PreparedMeatOutboundLineInput[];
};

export async function createPreparedMeatOutbound(
  input: PreparedMeatOutboundInput,
): Promise<string> {
  const { data, error } = await supabase.rpc("create_prepared_meat_outbound", {
    p_customer_id: input.customerId,
    p_shipping_method_id: input.shippingMethodId || null,
    p_order_number: input.orderNumber.trim(),
    p_shipping_date: input.shippingDate,
    p_remarks: (input.remarks ?? "").trim() || null,
    p_lines: input.lines.map((line) => ({
      prepared_meat_item_id: line.preparedMeatItemId,
      quantity: line.quantity,
      remarks: (line.remarks ?? "").trim() || null,
    })),
  });
  if (error) throw error;
  return data as string;
}

