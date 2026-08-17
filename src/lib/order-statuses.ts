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
