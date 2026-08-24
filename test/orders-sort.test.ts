import { describe, expect, it } from "vitest";

import { getOrderListSorts } from "@/lib/orders";

describe("order list sorting", () => {
  it("keeps the newest created order first unless delivery sorting is selected", () => {
    expect(getOrderListSorts(undefined)).toEqual([
      { column: "bubble_created_at", ascending: false, nullsFirst: false },
      { column: "created_at", ascending: false },
    ]);

    expect(getOrderListSorts("desc")[0]).toEqual({
      column: "delivery_at",
      ascending: false,
      nullsFirst: false,
    });
  });
});
