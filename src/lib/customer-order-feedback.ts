import { supabase } from "@/lib/supabase";

export type OrderFeedback = { order_number: string; delivery_at: string | null; comment: string | null; submitted: boolean };

async function rpc(name: string, args: Record<string, unknown>): Promise<OrderFeedback> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  if (!data || typeof data.order_number !== "string" || typeof data.submitted !== "boolean") throw new Error("feedback_unavailable");
  return data as OrderFeedback;
}

export const openOrderFeedback = (token: string) => rpc("customer_order_feedback_open", { p_token: token });
export const submitOrderFeedback = (token: string, comment: string) => rpc("customer_order_feedback_submit", { p_token: token, p_comment: comment });
export async function fetchAccountOrderFeedback(orderId: string): Promise<OrderFeedback | null> {
  const { data, error } = await supabase.rpc("customer_portal_order_feedback", { p_order_id: orderId });
  if (error) throw error;
  if (data == null) return null;
  if (typeof data.order_number !== "string" || typeof data.submitted !== "boolean") throw new Error("feedback_unavailable");
  return data as OrderFeedback;
}
export const submitAccountOrderFeedback = (orderId: string, comment: string) => rpc("customer_portal_order_feedback_submit", { p_order_id: orderId, p_comment: comment });
