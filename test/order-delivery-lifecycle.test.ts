import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { deliveryInsertMock, fromMock, rpcMock } = vi.hoisted(() => ({
  deliveryInsertMock: vi.fn(),
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
  },
}));

import {
  updateOrderFactoryStatus,
  updateQuote,
  type QuoteDraft,
} from "@/lib/quote-editor";

function orderDraft(): QuoteDraft {
  return {
    channelId: "channel-1",
    quoteStatus: "",
    quoteSalesSourceId: "",
    quoteCommunicationChannelId: "",
    followUpDate: "",
    customerName: "Test customer",
    companyName: "",
    contactA: "",
    contactB: "",
    email: "",
    asanaLink: "",
    address: "Test address",
    districtId: "district-1",
    districtName: "",
    shippingMethodId: "shipping-1",
    deliveryDate: "2026-09-02",
    deliveryTime: "12:00",
    shipOutTime: "10:00",
    customerNote: "",
    packingNote: "",
    salesPartnerId: "",
    internalNote: "",
    tagIds: [],
  };
}

describe("order delivery lifecycle", () => {
  beforeEach(() => {
    deliveryInsertMock.mockReset().mockResolvedValue({ error: null });
    fromMock.mockReset();
    rpcMock.mockReset().mockResolvedValue({ data: "delivery-1", error: null });

    fromMock.mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
              in: vi.fn().mockResolvedValue({ error: null }),
            })),
          })),
        };
      }
      if (table === "deliveries") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                })),
              })),
            })),
          })),
          insert: deliveryInsertMock,
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      if (table === "order_tag_assignments") {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("does not create a delivery when an unsent order is merely saved", async () => {
    await updateQuote("order-1", orderDraft(), "order");

    expect(deliveryInsertMock).not.toHaveBeenCalled();
  });

  it("keeps quote delivery planning unchanged", async () => {
    await updateQuote("quote-1", orderDraft(), "quote");

    expect(deliveryInsertMock).toHaveBeenCalledWith(expect.objectContaining({
      order_id: "quote-1",
      delivery_status: "Pending",
    }));
  });

  it("generates the delivery through the send-to-factory transaction", async () => {
    await updateOrderFactoryStatus("order-1", true);

    expect(rpcMock).toHaveBeenCalledWith("set_order_factory_status", {
      p_order_id: "order-1",
      p_sent: true,
    });
  });

  it("enforces the lifecycle at the database boundary", () => {
    const migration = readFileSync(
      "supabase/migrations/20260824120000_defer_delivery_until_factory_send.sql",
      "utf8",
    );

    expect(migration).toContain("defer_order_delivery_until_factory_send");
    expect(migration).toContain("v_is_sent_to_factory is distinct from true");
    expect(migration).toContain("return null");
    expect(migration).toContain("set_order_factory_status");
    expect(migration).toContain("insert into public.deliveries");
  });

  it("keeps an order in Shopify review while its district is empty", () => {
    const migration = readFileSync(
      "supabase/migrations/20260824120000_defer_delivery_until_factory_send.sql",
      "utf8",
    );

    expect(migration).toContain(
      "p_sent and v_order.delivery_district_id is null",
    );
    expect(migration).toContain("order_delivery_district_required");
  });

  it("enforces all nine factory-send fields at the database boundary", () => {
    const migration = readFileSync(
      "supabase/migrations/20260829141000_require_factory_delivery_times.sql",
      "utf8",
    );

    expect(migration).toContain("new.channel_id is null");
    expect(migration).toContain("new.customer_name_snapshot");
    expect(migration).toContain("new.contact_number_a_snapshot");
    expect(migration).toContain("new.email_snapshot");
    expect(migration).toContain("new.shipping_method_id is null");
    expect(migration).toContain("new.delivery_district_id is null");
    expect(migration).toContain("new.delivery_at is null");
    expect(migration).toContain("new.delivery_time");
    expect(migration).toContain("order_factory_delivery_time_required");
    expect(migration).toContain("new.ship_out_time");
    expect(migration).toContain("order_factory_ship_out_time_required");
  });
});
