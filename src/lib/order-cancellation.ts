import { supabase } from "@/lib/supabase";

/** Cancels the order's entire delivery while keeping its audit history. */
export async function cancelOrderDelivery(orderId: string) {
  const { error } = await supabase.rpc("cancel_order_delivery", {
    p_order_id: orderId,
  });
  if (error) throw error;
}

export function canCancelOrderDelivery(status: string | null | undefined) {
  return !["已取消", "取消", "Cancelled"].includes((status ?? "").trim());
}
