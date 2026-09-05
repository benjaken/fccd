import { describe, expect, it } from "vitest";

import {
  customerServiceBurstDelay,
  customerServiceBurstProcessAt,
  mergeCustomerServiceBufferedMessages,
} from "../supabase/functions/_shared/customer-service-burst.ts";

describe("customer service inbound burst", () => {
  it("waits for quiet time but never beyond five seconds from the first message", () => {
    const first = new Date("2026-09-05T10:00:00.000Z");
    expect(customerServiceBurstProcessAt({
      firstReceivedAt: first,
      lastReceivedAt: new Date("2026-09-05T10:00:01.000Z"),
    }).toISOString()).toBe("2026-09-05T10:00:03.500Z");
    expect(customerServiceBurstProcessAt({
      firstReceivedAt: first,
      lastReceivedAt: new Date("2026-09-05T10:00:04.500Z"),
    }).toISOString()).toBe("2026-09-05T10:00:05.000Z");
  });

  it("merges rapid messages in timestamp order for one compound turn", () => {
    expect(mergeCustomerServiceBufferedMessages([
      { providerMessageId: "2", text: "9月11日", receivedAt: "2026-09-05T10:00:01Z" },
      { providerMessageId: "1", text: "我想訂餐", receivedAt: "2026-09-05T10:00:00Z" },
      { providerMessageId: "3", text: "唔係，改30人", receivedAt: "2026-09-05T10:00:02Z" },
    ])).toBe("[訊息 1] 我想訂餐\n[訊息 2] 9月11日\n[訊息 3] 唔係，改30人");
  });

  it("keeps a single message unchanged and calculates a non-negative delay", () => {
    expect(mergeCustomerServiceBufferedMessages([
      { providerMessageId: "1", text: " 查訂單 ", receivedAt: "2026-09-05T10:00:00Z" },
    ])).toBe("查訂單");
    expect(customerServiceBurstDelay("2026-09-05T10:00:02Z", Date.parse("2026-09-05T10:00:00Z")))
      .toBe(2_000);
    expect(customerServiceBurstDelay("2026-09-05T10:00:00Z", Date.parse("2026-09-05T10:00:02Z")))
      .toBe(0);
  });
});
