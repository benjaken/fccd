import { supabase } from "@/lib/supabase";

const ORDER_EDIT_PRESENCE_TOPIC = "order-edit-presence-v1";

type OrderEditPresenceMeta = {
  order_id?: unknown;
  lock_token?: unknown;
};

export type ActiveOrderEditPresenceSubscriber = (
  onChange: (orderIds: Set<string>) => void,
) => () => void;

function activeOrderIdsFromPresenceState(state: unknown): Set<string> {
  const orderIds = new Set<string>();
  if (!state || typeof state !== "object") return orderIds;

  for (const presences of Object.values(state)) {
    if (!Array.isArray(presences)) continue;
    for (const presence of presences as OrderEditPresenceMeta[]) {
      if (typeof presence.order_id === "string" && presence.order_id) {
        orderIds.add(presence.order_id);
      }
    }
  }
  return orderIds;
}

/**
 * Advertises an open order editor through Supabase Realtime Presence.
 * Realtime removes this presence automatically when the tab, browser, or
 * network connection closes, so factory screens do not depend on unload
 * requests completing successfully.
 */
export function trackOrderEditPresence(
  orderId: string,
  lockToken: string,
): () => void {
  let disposed = false;
  const channel = supabase.channel(ORDER_EDIT_PRESENCE_TOPIC, {
    config: { private: true, presence: { key: lockToken } },
  });

  channel.subscribe((status) => {
    if (status !== "SUBSCRIBED" || disposed) return;
    void channel.track({
      order_id: orderId,
      lock_token: lockToken,
      online_at: new Date().toISOString(),
    });
  });

  return () => {
    disposed = true;
    void channel.untrack().finally(() => {
      void supabase.removeChannel(channel);
    });
  };
}

/** Subscribes factory views to the exact, current set of open order editors. */
export const subscribeActiveOrderEditPresence: ActiveOrderEditPresenceSubscriber = (
  onChange,
) => {
  let disposed = false;
  const watcherKey = `factory-${crypto.randomUUID()}`;
  const channel = supabase.channel(ORDER_EDIT_PRESENCE_TOPIC, {
    config: { private: true, presence: { key: watcherKey } },
  });
  const emit = () => {
    if (!disposed) onChange(activeOrderIdsFromPresenceState(channel.presenceState()));
  };

  channel.on("presence", { event: "sync" }, emit).subscribe();

  return () => {
    disposed = true;
    void supabase.removeChannel(channel);
  };
};

export const orderEditPresenceInternals = {
  activeOrderIdsFromPresenceState,
};
