import { supabase } from "@/lib/supabase";

export type RewardRuleVersion = {
  id: string;
  hkd_per_point: number | null;
  effective_at: string;
  created_at: string;
  created_by: string | null;
  is_active: boolean;
};

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export function rewardRuleThreshold(value: unknown): number | null {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) return null;
  const rate=Number(value);
  return Number.isFinite(rate) && rate>=0 && rate<=100000 ? rate : null;
}
export async function listRewardRules(): Promise<RewardRuleVersion[]> {
  const rows=await rpc<RewardRuleVersion[]>("customer_portal_ops_list_reward_rules");
  if (!Array.isArray(rows)) throw new Error("reward_rules_unavailable");
  return rows.map(row=>({...row,hkd_per_point:rewardRuleThreshold(row.hkd_per_point)}));
}

export const createRewardRule = (hkdPerPoint: number, effectiveAt: string) =>
  rpc<string>("customer_portal_ops_create_reward_rule", {
    p_hkd_per_point: hkdPerPoint,
    p_effective_at: effectiveAt,
  });

export type PointHoliday = { holiday_on: string; name: string };
export const listPointHolidays = () => rpc<PointHoliday[]>("customer_portal_ops_list_point_holidays");
export const setPointHoliday = (day: string, name: string, remove = false) =>
  rpc<void>("customer_portal_ops_set_point_holiday", { p_day: day, p_name: name, p_remove: remove });
export const recordFoodRefund = (orderId: string, foodAmount: number) =>
  rpc<void>("customer_portal_ops_record_food_refund", { p_order_id: orderId, p_food: foodAmount });

export type RefundOrderMatch = {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  company_name: string | null;
  phone: string | null;
  delivery_at: string | null;
  delivery_status: string | null;
  grand_total: number | null;
  outstanding: number | null;
  shipping_fee: number | null;
  food_amount: number | null;
};

export async function searchRefundOrders(query: string): Promise<RefundOrderMatch[]> {
  const rows = await rpc<RefundOrderMatch[]>("customer_portal_ops_search_refund_orders", { p_query: query });
  if (!Array.isArray(rows)) throw new Error("reward_orders_unavailable");
  return rows;
}
