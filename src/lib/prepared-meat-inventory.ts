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
  meatOrderId: string | null;
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
  meat_order_line_id?: string | null;
  meat_customers:
    | { id: string; name: string | null }
    | { id: string; name: string | null }[]
    | null;
  meat_order_lines?:
    | { meat_order_id: string | null }
    | { meat_order_id: string | null }[]
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

function relatedOrderId(row: PreparedMeatMovementRecord): string | null {
  const nested = Array.isArray(row.meat_order_lines)
    ? row.meat_order_lines[0]
    : row.meat_order_lines;
  return nested?.meat_order_id ?? null;
}

async function withMeatOrderIds(
  rows: PreparedMeatMovementRecord[],
): Promise<PreparedMeatMovementRecord[]> {
  const missingLineIds = [
    ...new Set(
      rows
        .filter((row) => !relatedOrderId(row) && row.meat_order_line_id)
        .map((row) => row.meat_order_line_id as string),
    ),
  ];
  if (missingLineIds.length === 0) return rows;

  const { data, error } = await supabase
    .from("meat_order_lines")
    .select("id,meat_order_id")
    .in("id", missingLineIds);
  if (error) throw error;

  const orderByLine = new Map(
    ((data ?? []) as Array<{ id: string; meat_order_id: string | null }>).map(
      (line) => [line.id, line.meat_order_id],
    ),
  );

  return rows.map((row) => {
    if (relatedOrderId(row) || !row.meat_order_line_id) return row;
    const meatOrderId = orderByLine.get(row.meat_order_line_id) ?? null;
    if (!meatOrderId) return row;
    return {
      ...row,
      meat_order_lines: { meat_order_id: meatOrderId },
    };
  });
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
      meatOrderId: relatedOrderId(row),
    };
  });

  return withBalance.reverse();
}

function mapItem(row: ItemRow): PreparedMeatItemOption {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    sortOrder: toNumber(row.sort_order),
    isActive: row.is_active !== false,
  };
}

function nullifTrim(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

export async function fetchPreparedMeatItems(): Promise<PreparedMeatItemOption[]> {
  const { data, error } = await supabase
    .from("prepared_meat_items")
    .select("id,sku,name,unit,sort_order,is_active")
    .is("archived_at", null)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as ItemRow[]).map(mapItem);
}

async function fetchPreparedMeatItemById(
  itemId: string,
): Promise<PreparedMeatItemOption> {
  const { data, error } = await supabase
    .from("prepared_meat_items")
    .select("id,sku,name,unit,sort_order,is_active")
    .eq("id", itemId)
    .is("archived_at", null)
    .single();

  if (error) throw error;
  return mapItem(data as ItemRow);
}

export type PreparedMeatRawMeatChoice = {
  id: string;
  name: string;
};

export async function fetchPreparedMeatRawMeatChoices(): Promise<
  PreparedMeatRawMeatChoice[]
> {
  const { data, error } = await supabase
    .from("raw_meat_items")
    .select("id,name")
    .is("archived_at", null)
    .eq("is_active", true)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as PreparedMeatRawMeatChoice[]).filter((row) =>
    Boolean(row.name?.trim()),
  );
}

export type PreparedMeatItemWriteInput = {
  name: string;
  englishName?: string | null;
  sku?: string | null;
  unit?: string | null;
  kgPerPackage?: number | null;
  rawMeatItemIds: string[];
};

export async function createPreparedMeatItem(
  input: PreparedMeatItemWriteInput,
): Promise<PreparedMeatItemOption> {
  const name = input.name.trim();
  if (!name) throw new Error("name_required");

  const { data, error } = await supabase.rpc("create_prepared_meat_item", {
    p_name: name,
    p_english_name: nullifTrim(input.englishName),
    p_sku: nullifTrim(input.sku),
    p_unit: nullifTrim(input.unit),
    p_kg_per_package: input.kgPerPackage ?? null,
    p_raw_meat_item_id: input.rawMeatItemIds[0] ?? null,
  });
  if (error) throw error;
  return fetchPreparedMeatItemById(data as string);
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
        "id,movement_at,inbound_packages,outbound_packages,remarks,bubble_created_at,created_at,meat_customer_id,meat_order_line_id,meat_customers(id,name),meat_order_lines(meat_order_id)",
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
    await withMeatOrderIds((yearResult.data ?? []) as PreparedMeatMovementRecord[]),
    productName,
    opening,
  );
}

export const GUIHUA_CUSTOMER_MARKER = "桂花小幸";
export const RAW_MEAT_OUTBOUND_CUSTOMER_MARKERS = ["到會", "凍肉製作"] as const;

export function canSelectPreparedMeatShippingMethod(
  customerName: string | null | undefined,
) {
  return (customerName ?? "").includes(GUIHUA_CUSTOMER_MARKER);
}

export function canShipRawMeatOnPreparedOutbound(
  customerName: string | null | undefined,
) {
  const name = customerName ?? "";
  return RAW_MEAT_OUTBOUND_CUSTOMER_MARKERS.some((marker) =>
    name.includes(marker),
  );
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

/** Keep digits only while typing whole packages. */
export function coercePreparedMeatIntegerInput(value: string): string {
  return coercePreparedMeatQuantityInput(value).split(".")[0] ?? "";
}

export function budgetedPreparedYieldPacks(
  outboundKg: number,
  kgPerPackage: number,
) {
  if (!(outboundKg > 0) || !(kgPerPackage > 0)) return 0;
  return Math.round(outboundKg / kgPerPackage);
}

export function preparedInboundPackRange(budgetedPacks: number) {
  const budgeted = Math.max(0, Math.round(budgetedPacks));
  return {
    min: Math.round(budgeted * 0.5),
    max: Math.round(budgeted * 1.5),
  };
}

export function isPreparedInboundPackAllowed(
  quantity: number,
  budgetedPacks: number,
) {
  if (!Number.isInteger(quantity) || quantity <= 0) return false;
  const { min, max } = preparedInboundPackRange(budgetedPacks);
  return quantity >= min && quantity <= max;
}

export function formatPreparedMeatKg(value: number) {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
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

export type DirectShipRawMeatOption = {
  id: string;
  sku: string | null;
  name: string;
  unit: string | null;
};

export async function fetchDirectShipRawMeatItems(): Promise<
  DirectShipRawMeatOption[]
> {
  const { data, error } = await supabase
    .from("raw_meat_items")
    .select("id,sku,name,unit")
    .is("archived_at", null)
    .eq("is_active", true)
    .eq("can_ship_directly", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as DirectShipRawMeatOption[]).filter((row) =>
    Boolean(row.name?.trim()),
  );
}

export type PreparedMeatOutboundStockBalances = {
  prepared: Record<string, number>;
  raw: Record<string, number>;
};

function mapStockObject(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, number> = {};
  for (const [id, stock] of Object.entries(value as Record<string, unknown>)) {
    const parsed = Number.parseFloat(String(stock));
    if (id && Number.isFinite(parsed)) result[id] = parsed;
  }
  return result;
}

export function formatPreparedMeatStock(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return String(Number.parseFloat(value.toFixed(3)));
}

export function remainingPreparedMeatOutboundStock(input: {
  onHand: number;
  originalQuantity: number;
  committedQuantity: number;
}) {
  return input.onHand + input.originalQuantity - input.committedQuantity;
}

export async function fetchPreparedMeatOutboundStockBalances(): Promise<PreparedMeatOutboundStockBalances> {
  const { data, error } = await supabase.rpc(
    "prepared_meat_outbound_stock_balances",
  );
  if (error) throw error;
  const payload = (data ?? {}) as {
    prepared?: unknown;
    raw?: unknown;
  };
  return {
    prepared: mapStockObject(payload.prepared),
    raw: mapStockObject(payload.raw),
  };
}

export type PreparedMeatOutboundLineInput = {
  preparedMeatItemId?: string | null;
  rawMeatItemId?: string | null;
  quantity: number;
  remarks?: string | null;
};

export type PreparedMeatOutboundInput = {
  orderId?: string | null;
  customerId: string;
  shippingMethodId?: string | null;
  orderNumber: string;
  shippingDate: string;
  remarks?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  address?: string | null;
  lines: PreparedMeatOutboundLineInput[];
};

export type PreparedMeatOutboundLoadedLine = {
  kind: "prepared" | "raw";
  itemId: string;
  sku: string | null;
  name: string;
  unit: string | null;
  quantity: number;
  remarks: string;
};

export type PreparedMeatOutboundOrder = {
  id: string;
  customerId: string;
  shippingMethodId: string | null;
  orderNumber: string;
  shippingAt: string | null;
  remarks: string;
  sendToFactory: boolean;
  contactPerson: string;
  phone: string;
  address: string;
  lines: PreparedMeatOutboundLoadedLine[];
};

type NestedItem = {
  id?: string | null;
  sku?: string | null;
  name?: string | null;
  unit?: string | null;
};

function firstNested<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapOutboundLine(row: {
  quantity: number | string | null;
  remarks: string | null;
  prepared_meat_item_id: string | null;
  raw_meat_item_id: string | null;
  prepared_meat_items: NestedItem | NestedItem[] | null;
  raw_meat_items: NestedItem | NestedItem[] | null;
}): PreparedMeatOutboundLoadedLine | null {
  const prepared = firstNested(row.prepared_meat_items);
  const raw = firstNested(row.raw_meat_items);
  const quantity = toNumber(row.quantity);
  if (quantity === null || quantity <= 0) return null;
  if (row.prepared_meat_item_id && prepared?.id) {
    return {
      kind: "prepared",
      itemId: prepared.id,
      sku: prepared.sku ?? null,
      name: prepared.name ?? "",
      unit: prepared.unit ?? null,
      quantity,
      remarks: row.remarks ?? "",
    };
  }
  if (row.raw_meat_item_id && raw?.id) {
    return {
      kind: "raw",
      itemId: raw.id,
      sku: raw.sku ?? null,
      name: raw.name ?? "",
      unit: raw.unit ?? null,
      quantity,
      remarks: row.remarks ?? "",
    };
  }
  return null;
}

export async function fetchPreparedMeatOutboundOrder(
  orderId: string,
): Promise<PreparedMeatOutboundOrder> {
  const { data, error } = await supabase
    .from("meat_orders")
    .select(
      "id,order_number,order_at,shipping_at,remarks,send_to_factory,meat_customer_id,shipping_method_id,meat_customers(contact_person,phone,address),meat_order_lines(id,quantity,remarks,sort_order,prepared_meat_item_id,raw_meat_item_id,prepared_meat_items(id,sku,name,unit),raw_meat_items(id,sku,name,unit))",
    )
    .eq("id", orderId)
    .single();

  if (error) throw error;
  const customer = firstNested(
    data.meat_customers as
      | { contact_person: string | null; phone: string | null; address: string | null }
      | { contact_person: string | null; phone: string | null; address: string | null }[]
      | null,
  );
  const lines = (
    (data.meat_order_lines ?? []) as Array<{
      quantity: number | string | null;
      remarks: string | null;
      sort_order: number | string | null;
      prepared_meat_item_id: string | null;
      raw_meat_item_id: string | null;
      prepared_meat_items: NestedItem | NestedItem[] | null;
      raw_meat_items: NestedItem | NestedItem[] | null;
    }>
  )
    .sort((left, right) => (toNumber(left.sort_order) ?? 0) - (toNumber(right.sort_order) ?? 0))
    .map(mapOutboundLine)
    .filter((line): line is PreparedMeatOutboundLoadedLine => Boolean(line));

  return {
    id: data.id as string,
    customerId: (data.meat_customer_id as string | null) ?? "",
    shippingMethodId: (data.shipping_method_id as string | null) ?? null,
    orderNumber: String(data.order_number ?? ""),
    shippingAt:
      (data.shipping_at as string | null) ??
      (data.order_at as string | null) ??
      null,
    remarks: String(data.remarks ?? ""),
    sendToFactory: Boolean(data.send_to_factory),
    contactPerson: customer?.contact_person ?? "",
    phone: customer?.phone ?? "",
    address: customer?.address ?? "",
    lines,
  };
}

function outboundRpcPayload(input: PreparedMeatOutboundInput) {
  return {
    p_order_id: input.orderId || null,
    p_customer_id: input.customerId,
    p_shipping_method_id: input.shippingMethodId || null,
    p_order_number: input.orderNumber.trim(),
    p_shipping_date: input.shippingDate,
    p_remarks: (input.remarks ?? "").trim() || null,
    p_contact_person: (input.contactPerson ?? "").trim() || null,
    p_phone: (input.phone ?? "").trim() || null,
    p_address: (input.address ?? "").trim() || null,
    p_lines: input.lines.map((line) => ({
      prepared_meat_item_id: line.preparedMeatItemId || null,
      raw_meat_item_id: line.rawMeatItemId || null,
      quantity: line.quantity,
      remarks: (line.remarks ?? "").trim() || null,
    })),
  };
}

export async function createPreparedMeatOutbound(
  input: PreparedMeatOutboundInput,
): Promise<string> {
  const { data, error } = await supabase.rpc("save_prepared_meat_outbound", {
    ...outboundRpcPayload({ ...input, orderId: null }),
  });
  if (error) throw error;
  return data as string;
}

export async function updatePreparedMeatOutbound(
  input: PreparedMeatOutboundInput & { orderId: string },
): Promise<string> {
  const { data, error } = await supabase.rpc("save_prepared_meat_outbound", {
    ...outboundRpcPayload(input),
  });
  if (error) throw error;
  return data as string;
}

export async function sendPreparedMeatOrderToFactory(
  orderId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc(
    "send_prepared_meat_order_to_factory",
    { p_order_id: orderId },
  );
  if (error) throw error;
  return data as string;
}

export type PreparedMeatInboundNoRawLine = {
  preparedMeatItemId: string;
  quantity: number;
  remarks?: string | null;
};

export type PreparedMeatInboundNoRawInput = {
  movementDate: string;
  lines: PreparedMeatInboundNoRawLine[];
};

export async function createPreparedMeatInboundNoRaw(
  input: PreparedMeatInboundNoRawInput,
): Promise<string> {
  const { data, error } = await supabase.rpc(
    "create_prepared_meat_inbound_no_raw",
    {
      p_movement_date: input.movementDate,
      p_lines: input.lines.map((line) => ({
        prepared_meat_item_id: line.preparedMeatItemId,
        quantity: line.quantity,
        remarks: (line.remarks ?? "").trim() || null,
      })),
    },
  );
  if (error) throw error;
  return data as string;
}

export type PreparedMeatInboundRawProduct = {
  id: string;
  sku: string | null;
  name: string;
  unit: string | null;
  kgPerPackage: number;
};

export type PreparedMeatInboundRawPreview = {
  remainingKg: number;
  items: PreparedMeatInboundRawProduct[];
};

export async function fetchPreparedMeatInboundRawPreview(
  rawMeatItemId: string,
): Promise<PreparedMeatInboundRawPreview> {
  const { data, error } = await supabase.rpc(
    "prepared_meat_inbound_raw_preview",
    { p_raw_meat_item_id: rawMeatItemId },
  );
  if (error) throw error;
  const payload = (data ?? {}) as {
    remaining_kg?: number | string | null;
    items?: Array<{
      id?: string;
      sku?: string | null;
      name?: string | null;
      unit?: string | null;
      kg_per_package?: number | string | null;
    }>;
  };
  return {
    remainingKg: Number.parseFloat(String(payload.remaining_kg ?? 0)) || 0,
    items: (payload.items ?? [])
      .map((item) => ({
        id: item.id ?? "",
        sku: item.sku ?? null,
        name: (item.name ?? "").trim(),
        unit: item.unit ?? null,
        kgPerPackage: Number.parseFloat(String(item.kg_per_package ?? 0)) || 0,
      }))
      .filter((item) => item.id && item.name && item.kgPerPackage > 0),
  };
}

export type PreparedMeatInboundWithRawInput = {
  rawMeatItemId: string;
  movementDate: string;
  outboundKg: number;
  remarks?: string | null;
  lines: Array<{
    preparedMeatItemId: string;
    quantity: number;
  }>;
};

export async function createPreparedMeatInboundWithRaw(
  input: PreparedMeatInboundWithRawInput,
): Promise<string> {
  const { data, error } = await supabase.rpc(
    "create_prepared_meat_inbound_with_raw",
    {
      p_raw_meat_item_id: input.rawMeatItemId,
      p_movement_date: input.movementDate,
      p_outbound_kg: input.outboundKg,
      p_remarks: (input.remarks ?? "").trim() || null,
      p_lines: input.lines.map((line) => ({
        prepared_meat_item_id: line.preparedMeatItemId,
        quantity: line.quantity,
      })),
    },
  );
  if (error) throw error;
  return data as string;
}

