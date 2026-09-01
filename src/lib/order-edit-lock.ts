import {
  supabase,
  supabasePublishableKey,
  supabaseUrl,
} from "@/lib/supabase";

export const ORDER_EDIT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const ORDER_EDIT_HEARTBEAT_INTERVAL_MS = 60 * 1000;

let editSessionAccessToken: string | null = null;

export async function touchOrderEditSession(
  orderId: string,
  lockToken: string,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  editSessionAccessToken = session?.access_token ?? null;
  const { error } = await supabase.rpc("touch_order_edit_session", {
    p_order_id: orderId,
    p_lock_token: lockToken,
  });
  if (error) throw error;
}

export async function releaseOrderEditSession(
  lockToken: string,
  options: { keepalive?: boolean } = {},
): Promise<void> {
  if (options.keepalive && editSessionAccessToken) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/release_order_edit_session`,
      {
        method: "POST",
        keepalive: true,
        headers: {
          apikey: supabasePublishableKey,
          Authorization: `Bearer ${editSessionAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_lock_token: lockToken }),
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to release order edit session (${response.status})`);
    }
    return;
  }

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
