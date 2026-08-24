import { supabase } from "@/lib/supabase";
import { DICT_TYPE, dictItemLabel, fetchDictItems } from "@/lib/dictionaries";

export type OrderListEnhancementFilters = {
  deliveryDate?: string;
  deliveryStart?: string;
  deliveryEnd?: string;
  brandIds?: string[];
  orderTagIds?: string[];
  manualTodoKeys?: string[];
  festivalIds?: string[];
  districtNames?: string[];
  deliverySort?: "asc" | "desc";
};

export type OrderListFilterOption = { id: string; name: string };

export type OrderListFilterOptions = {
  festivals: OrderListFilterOption[];
  districts: OrderListFilterOption[];
};

export type OrderListManualTodo = {
  id: string;
  orderId: string;
  key: string;
  label: string;
};

type TodoRow = {
  id: string;
  order_id: string;
  todo_key: string;
};

function namedOptions(rows: Array<{ id: string; name: string | null }>) {
  return rows.flatMap((row) => {
    const name = row.name?.trim();
    return name ? [{ id: row.id, name }] : [];
  });
}

function uniqueDistrictNames(rows: OrderListFilterOption[]) {
  const names = new Map<string, OrderListFilterOption>();
  for (const row of rows) {
    const key = row.name.toLocaleLowerCase("zh-HK");
    if (!names.has(key)) names.set(key, { id: row.name, name: row.name });
  }
  return [...names.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "zh-HK"),
  );
}

export async function fetchOrderListFilterOptions(): Promise<OrderListFilterOptions> {
  const [festivals, districts] = await Promise.all([
    supabase
      .from("festivals")
      .select("id,name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("delivery_districts")
      .select("id,name")
      .is("archived_at", null)
      .order("name"),
  ]);
  if (festivals.error) throw festivals.error;
  if (districts.error) throw districts.error;
  return {
    festivals: namedOptions(festivals.data ?? []),
    districts: uniqueDistrictNames(namedOptions(districts.data ?? [])),
  };
}

export async function assignFestivalToOrders(
  orderIds: readonly string[],
  festivalId: string,
) {
  if (!orderIds.length) return;
  const { data: festival, error: festivalError } = await supabase
    .from("festivals")
    .select("id,legacy_id")
    .eq("id", festivalId)
    .eq("is_active", true)
    .single();
  if (festivalError) throw festivalError;
  const { error } = await supabase
    .from("orders")
    .update({
      festival_id: festival.id,
      festival_legacy_id: festival.legacy_id,
    })
    .in("id", [...orderIds]);
  if (error) throw error;
}

/**
 * The list enhancement is deployed independently from the existing orders
 * table. Until its migration has been applied, the core order list must keep
 * working instead of failing while reading optional to-dos.
 */
export function isManualTodoTableUnavailable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code ?? "") : "";
  return code === "42P01" || code === "PGRST205";
}

export async function fetchManualTodosForOrders(orderIds: readonly string[]) {
  if (!orderIds.length) return [] as OrderListManualTodo[];
  const { data, error } = await supabase
    .from("order_list_manual_todos")
    .select("id,order_id,todo_key")
    .in("order_id", [...orderIds])
    .order("created_at");
  if (error) {
    if (isManualTodoTableUnavailable(error)) return [];
    throw error;
  }
  const rows = (data ?? []) as TodoRow[];
  if (!rows.length) return [];
  const dictionary = await fetchDictItems(DICT_TYPE.orderManualTodo).catch(() => []);
  const labels = new Map(dictionary.map((item) => [item.value, dictItemLabel(item, "zh-HK")]));
  return rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    key: row.todo_key,
    label: labels.get(row.todo_key) ?? row.todo_key,
  }));
}

export async function findOrdersWithManualTodos(todoKeys: readonly string[]) {
  if (!todoKeys.length) return null;
  const { data, error } = await supabase
    .from("order_list_manual_todos")
    .select("order_id,todo_key")
    .in("todo_key", [...todoKeys]);
  if (error) {
    // A to-do filter cannot be evaluated without the optional table; return
    // no matches rather than broadening the filter to every order.
    if (isManualTodoTableUnavailable(error)) return [];
    throw error;
  }

  const keysByOrder = new Map<string, Set<string>>();
  for (const row of (data ?? []) as Array<Pick<TodoRow, "order_id" | "todo_key">>) {
    const keys = keysByOrder.get(row.order_id) ?? new Set<string>();
    keys.add(row.todo_key);
    keysByOrder.set(row.order_id, keys);
  }
  return [...keysByOrder]
    .filter(([, keys]) => todoKeys.every((key) => keys.has(key)))
    .map(([orderId]) => orderId);
}

export async function findOrdersWithOrderTags(orderTagIds: readonly string[]) {
  if (!orderTagIds.length) return null;
  const { data, error } = await supabase
    .from("order_tag_assignments")
    .select("order_id,order_tag_id")
    .in("order_tag_id", [...orderTagIds]);
  if (error) throw error;

  const tagsByOrder = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const tags = tagsByOrder.get(row.order_id) ?? new Set<string>();
    tags.add(row.order_tag_id);
    tagsByOrder.set(row.order_id, tags);
  }
  return [...tagsByOrder]
    .filter(([, tags]) => orderTagIds.every((tagId) => tags.has(tagId)))
    .map(([orderId]) => orderId);
}

export async function findOrdersWithDistrictNames(districtNames: readonly string[]) {
  if (!districtNames.length) return null;
  const { data: districts, error: districtError } = await supabase
    .from("delivery_districts")
    .select("id")
    .in("name", [...districtNames])
    .is("archived_at", null);
  if (districtError) throw districtError;
  const districtIds = (districts ?? []).map((row) => row.id);
  if (!districtIds.length) return [];

  const { data: deliveries, error: deliveryError } = await supabase
    .from("deliveries")
    .select("order_id")
    .in("district_id", districtIds);
  if (deliveryError) throw deliveryError;
  return [...new Set((deliveries ?? []).flatMap((row) => row.order_id ? [row.order_id] : []))];
}

export async function toggleManualOrderTodo(orderId: string, key: string) {
  const { data: current, error: loadError } = await supabase
    .from("order_list_manual_todos")
    .select("id")
    .eq("order_id", orderId)
    .eq("todo_key", key)
    .maybeSingle();
  if (loadError) throw loadError;
  if (current?.id) {
    const { error } = await supabase
      .from("order_list_manual_todos")
      .delete()
      .eq("id", current.id);
    if (error) throw error;
    return false;
  }
  const { error } = await supabase
    .from("order_list_manual_todos")
    .insert({ order_id: orderId, todo_key: key });
  if (error) throw error;
  return true;
}

export function hongKongDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function nextHongKongDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return hongKongDate(new Date(Date.UTC(year, (month ?? 1) - 1, (day ?? 1) + 1)));
}
