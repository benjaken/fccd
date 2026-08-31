import { supabase } from "@/lib/supabase";

export const ORDER_EDIT_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
export const ORDER_EDIT_HEARTBEAT_INTERVAL_MS = 60 * 1000;

export async function touchOrderEditSession(
  orderId: string,
  lockToken: string,
): Promise<void> {
  const { error } = await supabase.rpc("touch_order_edit_session", {
    p_order_id: orderId,
    p_lock_token: lockToken,
  });
  if (error) throw error;
}

export async function releaseOrderEditSession(lockToken: string): Promise<void> {
  const { error } = await supabase.rpc("release_order_edit_session", {
    p_lock_token: lockToken,
  });
  if (error) throw error;
}

export async function fetchActiveOrderEditIds(orderIds: string[]): Promise<Set<string>> {
  if (!orderIds.length) return new Set();
  const { data, error } = await supabase.rpc("active_order_edit_ids", {
    p_order_ids: orderIds,
  });
  // Keeps rolling deployments usable while the database migration and web
  // bundle briefly overlap. Once installed, all other errors still fail safe.
  if (error && error.code === "PGRST202") return new Set();
  if (error) throw error;
  return new Set(
    ((data ?? []) as Array<{ order_id: string }>).map((row) => row.order_id),
  );
}

export async function assertFactoryOrderPrintable(orderId: string): Promise<void> {
  const { error } = await supabase.rpc("assert_factory_order_printable", {
    p_order_id: orderId,
  });
  if (error && error.code === "PGRST202") return;
  if (error) throw error;
}
