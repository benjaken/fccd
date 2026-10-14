import { supabase } from "@/lib/supabase";
import { hongKongDateParts } from "@/lib/kitchen-calendar";

export type MealCalendarLine = { name: string; quantity: number | null };
export type MealCalendarOrder = {
  order_id: string;
  order_number: string | null;
  organization_id: string;
  organization_name: string;
  service_date: string;
  delivery_time: string | null;
  delivery_status: string | null;
  document_type: string;
  brand: string | null;
  address: string | null;
  lines: MealCalendarLine[];
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function hongKongTodayKey(now = new Date()) {
  const parts = hongKongDateParts(now);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function formatMealQuantity(value: number | string | null | undefined) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "0";
  return new Intl.NumberFormat("zh-HK", { maximumFractionDigits: 3 }).format(amount);
}

export function mealLineLabel(line: MealCalendarLine) {
  if (line.quantity === null || line.quantity === undefined || !Number.isFinite(Number(line.quantity))) {
    return line.name;
  }
  return `${line.name} ×${formatMealQuantity(line.quantity)}`;
}

export function mealSummary(lines: MealCalendarLine[]) {
  return lines.map(mealLineLabel).join("、");
}

export function groupMealOrdersByDay(orders: MealCalendarOrder[]) {
  const grouped = new Map<string, MealCalendarOrder[]>();
  for (const order of orders) {
    const day = grouped.get(order.service_date) ?? [];
    day.push(order);
    grouped.set(order.service_date, day);
  }
  return grouped;
}

export async function listMealCalendarOrders(from: string, to: string) {
  const { data, error } = await supabase.rpc("customer_portal_ops_meal_calendar", {
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return (data ?? []) as MealCalendarOrder[];
}
