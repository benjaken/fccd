import { supabase } from "@/lib/supabase";

export type DeliveryAllocation = {
  orderLineId: string;
  deliveryId: string;
  quantity: number;
};

export async function fetchOrderDeliveryAllocations(orderId: string): Promise<DeliveryAllocation[]> {
  const { data, error } = await supabase.rpc("get_order_line_delivery_allocations", { p_order_id: orderId });
  if (error) throw error;
  return (data ?? []).map((row: { order_line_id: string; delivery_id: string; allocated_quantity: number | string }) => ({
    orderLineId: row.order_line_id, deliveryId: row.delivery_id, quantity: Number(row.allocated_quantity),
  }));
}

export function allocationTotalMatches(quantity: number, allocations: number[]) {
  return allocations.every((value) => Number.isFinite(value) && value >= 0)
    && Math.abs(allocations.reduce((sum, value) => sum + value, 0) - quantity) < 0.0005;
}

export async function saveOrderDeliveryAllocations(orderId: string, allocations: DeliveryAllocation[]) {
  const grouped = new Map<string, Array<{ delivery_id: string; quantity: number }>>();
  for (const allocation of allocations) {
    const entries = grouped.get(allocation.orderLineId) ?? [];
    if (allocation.quantity > 0) entries.push({ delivery_id: allocation.deliveryId, quantity: allocation.quantity });
    grouped.set(allocation.orderLineId, entries);
  }
  const { error } = await supabase.rpc("set_order_delivery_allocations", {
    p_order_id: orderId,
    p_lines: [...grouped].map(([orderLineId, entries]) => ({ order_line_id: orderLineId, allocations: entries })),
  });
  if (error) throw error;
}
