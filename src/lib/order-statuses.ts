import { supabase } from "@/lib/supabase";

export const DEFAULT_ORDER_STATUS_COLOR = "#2563eb";

export type OrderStatusRow = {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
};

export type OrderStatusFilters = {
  search?: string;
};

export type OrderStatusWriteInput = {
  name: string;
  color: string;
};

type StatusRow = {
  id: string;
  name: string;
  color: string | null;
  bubble_created_at: string | null;
  created_at: string;
};

export function parseHexColor(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const hex = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const [, r, g, b] = hex;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

export function colorInputValue(value: string | null | undefined) {
  return parseHexColor(value) ?? DEFAULT_ORDER_STATUS_COLOR;
}

function mapRow(row: StatusRow): OrderStatusRow {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.bubble_created_at || row.created_at,
  };
}

function includesIgnoreCase(haystack: string | null | undefined, needle: string) {
  if (!needle) return true;
  return (haystack ?? "").toLocaleLowerCase("zh-HK").includes(
    needle.toLocaleLowerCase("zh-HK"),
  );
}

export function filterOrderStatuses(
  rows: OrderStatusRow[],
  filters: OrderStatusFilters = {},
) {
  const search = filters.search?.trim() ?? "";
  if (!search) return rows;
  return rows.filter(
    (row) =>
      includesIgnoreCase(row.name, search) ||
      includesIgnoreCase(row.color, search),
  );
}

const SELECT_FIELDS = "id,name,color,bubble_created_at,created_at";

export async function fetchOrderStatuses(
  filters: OrderStatusFilters = {},
): Promise<OrderStatusRow[]> {
  const { data, error } = await supabase
    .from("order_statuses")
    .select(SELECT_FIELDS)
    .is("archived_at", null)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw error;
  return filterOrderStatuses(
    ((data ?? []) as StatusRow[]).map(mapRow),
    filters,
  );
}

function writeFields(input: OrderStatusWriteInput) {
  const name = input.name.trim();
  const color = parseHexColor(input.color);
  if (!name) throw new Error("name_required");
  if (!color) throw new Error("color_required");
  return { name, color };
}

export async function createOrderStatus(
  input: OrderStatusWriteInput,
): Promise<OrderStatusRow> {
  const fields = writeFields(input);
  const now = new Date().toISOString();
  const legacyId = `web-order-status-${crypto.randomUUID()}`;

  const { data: last, error: lastError } = await supabase
    .from("order_statuses")
    .select("sort_order")
    .is("archived_at", null)
    .order("sort_order", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw lastError;

  const { data, error } = await supabase
    .from("order_statuses")
    .insert({
      legacy_id: legacyId,
      ...fields,
      sort_order: (last?.sort_order ?? 0) + 1,
      is_follow_up: false,
      is_editable: true,
      bubble_created_at: now,
      bubble_modified_at: now,
      created_at: now,
      updated_at: now,
    })
    .select(SELECT_FIELDS)
    .single();

  if (error) throw error;
  return mapRow(data as StatusRow);
}

export async function updateOrderStatus(
  statusId: string,
  input: OrderStatusWriteInput,
): Promise<OrderStatusRow> {
  const fields = writeFields(input);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("order_statuses")
    .update({
      ...fields,
      bubble_modified_at: now,
      updated_at: now,
    })
    .eq("id", statusId)
    .is("archived_at", null)
    .select(SELECT_FIELDS)
    .single();

  if (error) throw error;
  return mapRow(data as StatusRow);
}

export async function archiveOrderStatus(statusId: string): Promise<void> {
  const { error } = await supabase.rpc("archive_order_status", {
    p_status_id: statusId,
  });
  if (error) throw error;
}

export type ConfiguredOrderStatus = {
  id: string;
  legacyId: string;
  name: string;
  color: string | null;
  sortOrder: number | null;
};

export type OrderStatusView = {
  name: string;
  color: string | null;
};

type CatalogStatusRow = {
  id: string;
  legacy_id: string;
  name: string;
  color: string | null;
  sort_order: number | null;
};

function mapCatalogRow(row: CatalogStatusRow): ConfiguredOrderStatus {
  return {
    id: row.id,
    legacyId: row.legacy_id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
  };
}

function statusSort(
  left: Pick<ConfiguredOrderStatus, "name" | "sortOrder">,
  right: Pick<ConfiguredOrderStatus, "name" | "sortOrder">,
) {
  const leftOrder = left.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.sortOrder ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return left.name.localeCompare(right.name, "zh-Hant");
}

export async function fetchOrderStatusCatalog(): Promise<ConfiguredOrderStatus[]> {
  const { data, error } = await supabase
    .from("order_statuses")
    .select("id,legacy_id,name,color,sort_order")
    .is("archived_at", null)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name");
  if (error) throw error;

  return ((data ?? []) as CatalogStatusRow[]).map(mapCatalogRow);
}

export function resolveOrderStatuses(
  legacyIds: readonly string[] | null | undefined,
  catalog: readonly ConfiguredOrderStatus[],
): OrderStatusView[] {
  if (!legacyIds?.length) return [];

  const byLegacyId = new Map(
    catalog.map((status) => [status.legacyId, status]),
  );
  const seen = new Set<string>();
  const matched: ConfiguredOrderStatus[] = [];

  for (const legacyId of legacyIds) {
    const status = byLegacyId.get(legacyId);
    if (!status || seen.has(status.id)) continue;
    seen.add(status.id);
    matched.push(status);
  }

  return matched.sort(statusSort).map((status) => ({
    name: status.name,
    color: status.color,
  }));
}

export function orderStatusLabel(
  statuses: readonly OrderStatusView[] | null | undefined,
  empty = "",
) {
  const names = (statuses ?? [])
    .map((status) => status.name.trim())
    .filter(Boolean);
  return names.join(" ") || empty;
}

export function statusBadgeStyle(color: string | null | undefined) {
  if (!color) return undefined;
  return {
    background: `color-mix(in srgb, ${color} 18%, var(--card))`,
    color,
  };
}

const UNPAID_STATUS_NAMES = new Set(["未完成付款", "未付款"]);
export const DEFAULT_UNPAID_STATUS_COLOR = "#ef4444";

export const ORDER_TAG_QUEUE_NAMES = {
  "monthly-settlement": ["月結"],
  split: ["已拆單", "拆單"],
  "kitchen-notes": ["廚房備註"],
  "reschedule-pending": ["改期未定", "改期未審"],
} as const;

export type OrderTagQueuePreset = keyof typeof ORDER_TAG_QUEUE_NAMES;

export function isOrderTagQueuePreset(
  preset: string,
): preset is OrderTagQueuePreset {
  return Object.prototype.hasOwnProperty.call(ORDER_TAG_QUEUE_NAMES, preset);
}

export function catalogLegacyIdsForNames(
  catalog: readonly Pick<ConfiguredOrderStatus, "name" | "legacyId">[],
  names: readonly string[],
) {
  const wanted = new Set(names.map((name) => name.trim()).filter(Boolean));
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of catalog) {
    if (!wanted.has(row.name.trim()) || seen.has(row.legacyId)) continue;
    seen.add(row.legacyId);
    ids.push(row.legacyId);
  }
  return ids;
}

export function isUnpaidOrderStatusName(name: string | null | undefined) {
  return UNPAID_STATUS_NAMES.has((name ?? "").trim());
}

export function orderDetailTags(
  statuses: readonly OrderStatusView[] | null | undefined,
  outstanding: number | null | undefined,
  unpaidTag: OrderStatusView = {
    name: "未完成付款",
    color: DEFAULT_UNPAID_STATUS_COLOR,
  },
): OrderStatusView[] {
  const tags = [...(statuses ?? [])];
  const unpaidIndex = tags.findIndex((tag) =>
    isUnpaidOrderStatusName(tag.name),
  );

  if (outstanding === null || outstanding === undefined) {
    return tags;
  }
  if (outstanding > 0) {
    if (unpaidIndex >= 0) return tags;
    return [...tags, unpaidTag];
  }
  if (unpaidIndex < 0) return tags;
  return tags.filter((_, index) => index !== unpaidIndex);
}
