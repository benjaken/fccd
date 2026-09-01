import { describe, expect, it } from "vitest";

import { orderEditPresenceInternals } from "@/lib/order-edit-presence";

describe("order edit Realtime Presence", () => {
  it("collects the exact active order ids from Supabase presence state", () => {
    const active = orderEditPresenceInternals.activeOrderIdsFromPresenceState({
      "editor-a": [
        { order_id: "order-1", lock_token: "lock-1" },
        { order_id: "order-1", lock_token: "lock-2" },
      ],
      "editor-b": [{ order_id: "order-2", lock_token: "lock-3" }],
      "factory-watcher": [{ presence_ref: "watcher" }],
    });

    expect([...active].sort()).toEqual(["order-1", "order-2"]);
  });

  it("returns an empty set after Realtime removes every editor presence", () => {
    expect(
      orderEditPresenceInternals.activeOrderIdsFromPresenceState({}),
    ).toEqual(new Set());
  });
});
