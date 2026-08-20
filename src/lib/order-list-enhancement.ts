import { supabase } from "@/lib/supabase";

export const MANUAL_TODO_OPTIONS = [
  { key: "reschedule-pending", label: "Reschedule pending" },
  { key: "lwp", label: "LWP" },
  { key: "lbw", label: "LBW" },
  { key: "lfp", label: "LFP" },
  { key: "klook", label: "KLOOK" },
  { key: "alipay", label: "Alipay" },
  { key: "cancelled", label: "Cancelled" },
  { key: "monthly-settlement", label: "Monthly settlement" },
] as const;

export type ManualTodoKey = (typeof MANUAL_TODO_OPTIONS)[number]["key"];

export type OrderListEnhancementFilters = {
  deliveryDate?: string;
  deliveryStart?: string;
  deliveryEnd?: string;
  brandIds?: string[];
  statusTagIds?: string[];
  manualTodoKeys?: string[];
  deliverySort?: "asc" | "desc";
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

export function manualTodoLabel(key: string) {
  return MANUAL_TODO_OPTIONS.find((todo) => todo.key === key)?.label ?? key;
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
  return ((data ?? []) as TodoRow[]).map((row) => ({
    id: row.id,
    orderId: row.order_id,
    key: row.todo_key,
    label: manualTodoLabel(row.todo_key),
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
