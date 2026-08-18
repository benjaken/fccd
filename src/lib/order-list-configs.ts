import { supabase } from "@/lib/supabase";

export const ORDER_LIST_CONFIGS_CHANGED = "fccd:order-list-configs-changed";

export type OrderListConfigPreset =
  | "all"
  | "pending"
  | "unpaid"
  | "delivered-unpaid"
  | "monthly-settlement"
  | "split"
  | "kitchen-notes"
  | "reschedule-pending"
  | "shopify-pending"
  | "not-sent-factory";

export type OrderListConfigRow = {
  id: string;
  presetKey: OrderListConfigPreset;
  title: string;
  description: string;
  sortOrder: number;
  isVisible: boolean;
  route: string;
};

export type OrderListConfigWriteInput = {
  title: string;
  description: string;
  isVisible: boolean;
};

export type OrderListConfigFilters = {
  search?: string;
};

type ConfigRow = {
  id: string;
  preset_key: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_visible: boolean | null;
};

export const ORDER_LIST_ROUTES: Record<OrderListConfigPreset, string> = {
  all: "/orders",
  pending: "/orders/pending",
  unpaid: "/orders/unpaid",
  "delivered-unpaid": "/orders/delivered-unpaid",
  "monthly-settlement": "/orders/monthly",
  split: "/orders/split",
  "kitchen-notes": "/orders/kitchen-notes",
  "reschedule-pending": "/orders/reschedule-pending",
  "shopify-pending": "/orders/shopify-pending",
  "not-sent-factory": "/orders/not-sent-factory",
};

export const ORDER_LIST_NAV_PRESETS: Record<string, OrderListConfigPreset> = {
  allOrders: "all",
  pendingOrders: "pending",
  unpaidOrders: "unpaid",
  monthlyOrders: "monthly-settlement",
  splitOrders: "split",
  kitchenNotesOrders: "kitchen-notes",
  reschedulePendingOrders: "reschedule-pending",
  shopifyPendingOrders: "shopify-pending",
  notSentFactoryOrders: "not-sent-factory",
};

export const ORDER_LIST_I18N_KEYS: Record<
  OrderListConfigPreset,
  { title: string; description: string }
> = {
  all: { title: "title", description: "allDescription" },
  pending: { title: "pendingTitle", description: "pendingDescription" },
  unpaid: { title: "unpaidTitle", description: "unpaidDescription" },
  "delivered-unpaid": {
    title: "deliveredUnpaidTitle",
    description: "deliveredUnpaidDescription",
  },
  "monthly-settlement": {
    title: "monthlyTitle",
    description: "monthlyDescription",
  },
  split: { title: "splitTitle", description: "splitDescription" },
  "kitchen-notes": {
    title: "kitchenNotesTitle",
    description: "kitchenNotesDescription",
  },
  "reschedule-pending": {
    title: "reschedulePendingTitle",
    description: "reschedulePendingDescription",
  },
  "shopify-pending": {
    title: "shopifyPendingTitle",
    description: "shopifyPendingDescription",
  },
  "not-sent-factory": {
    title: "notSentFactoryTitle",
    description: "notSentFactoryDescription",
  },
};

const SELECT_FIELDS =
  "id,preset_key,title,description,sort_order,is_visible";

function isOrderListConfigPreset(
  value: string,
): value is OrderListConfigPreset {
  return Object.prototype.hasOwnProperty.call(ORDER_LIST_ROUTES, value);
}

function mapRow(row: ConfigRow): OrderListConfigRow | null {
  if (!isOrderListConfigPreset(row.preset_key)) return null;
  return {
    id: row.id,
    presetKey: row.preset_key,
    title: row.title,
    description: row.description?.trim() ?? "",
    sortOrder: row.sort_order,
    isVisible: row.is_visible !== false,
    route: ORDER_LIST_ROUTES[row.preset_key],
  };
}

function includesIgnoreCase(haystack: string | null | undefined, needle: string) {
  if (!needle) return true;
  return (haystack ?? "").toLocaleLowerCase("zh-HK").includes(
    needle.toLocaleLowerCase("zh-HK"),
  );
}

export function filterOrderListConfigs(
  rows: OrderListConfigRow[],
  filters: OrderListConfigFilters = {},
) {
  const search = filters.search?.trim() ?? "";
  if (!search) return rows;
  return rows.filter(
    (row) =>
      includesIgnoreCase(row.title, search) ||
      includesIgnoreCase(row.description, search) ||
      includesIgnoreCase(row.presetKey, search) ||
      includesIgnoreCase(row.route, search),
  );
}

export function canHideOrderList(presetKey: OrderListConfigPreset) {
  return presetKey !== "all";
}

export function orderListConfigByPreset(
  rows: readonly OrderListConfigRow[] | null | undefined,
) {
  return new Map((rows ?? []).map((row) => [row.presetKey, row]));
}

export function orderListNavLabel(
  navKey: string,
  configs: ReadonlyMap<OrderListConfigPreset, OrderListConfigRow>,
  fallback: string,
) {
  const preset = ORDER_LIST_NAV_PRESETS[navKey];
  if (!preset) return fallback;
  const title = configs.get(preset)?.title.trim();
  return title || fallback;
}

export function isOrderListNavVisible(
  navKey: string,
  configs: readonly OrderListConfigRow[] | null,
) {
  if (!configs) return true;
  const preset = ORDER_LIST_NAV_PRESETS[navKey];
  if (!preset) return true;
  const row = configs.find((item) => item.presetKey === preset);
  return row?.isVisible !== false;
}

export function notifyOrderListConfigsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ORDER_LIST_CONFIGS_CHANGED));
}

export async function fetchOrderListConfigs(
  filters: OrderListConfigFilters = {},
): Promise<OrderListConfigRow[]> {
  const { data, error } = await supabase
    .from("order_list_configs")
    .select(SELECT_FIELDS)
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });

  if (error) throw error;
  const rows = ((data ?? []) as ConfigRow[])
    .map(mapRow)
    .filter((row): row is OrderListConfigRow => row !== null);
  return filterOrderListConfigs(rows, filters);
}

function writeFields(input: OrderListConfigWriteInput) {
  const title = input.title.trim();
  if (!title) throw new Error("title_required");
  return {
    title,
    description: input.description.trim(),
    is_visible: input.isVisible,
  };
}

export async function updateOrderListConfig(
  id: string,
  input: OrderListConfigWriteInput,
): Promise<OrderListConfigRow> {
  const fields = writeFields(input);
  const { data, error } = await supabase
    .from("order_list_configs")
    .update({
      ...fields,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(SELECT_FIELDS)
    .single();

  if (error) throw error;
  const row = mapRow(data as ConfigRow);
  if (!row) throw new Error("order_list_config_invalid");
  notifyOrderListConfigsChanged();
  return row;
}
