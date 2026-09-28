import { describe, expect, it } from "vitest";

import { getOrderListSorts } from "@/lib/orders";

describe("order list sorting", () => {
  it("sorts delivery time from future to past unless ascending is selected", () => {
    const futureToPast = [
      { column: "delivery_at", ascending: false, nullsFirst: false },
      { column: "delivery_time", ascending: false, nullsFirst: false },
      { column: "bubble_created_at", ascending: false, nullsFirst: false },
      { column: "created_at", ascending: false },
    ];

    expect(getOrderListSorts(undefined)).toEqual(futureToPast);
    expect(getOrderListSorts("desc")).toEqual(futureToPast);
    expect(getOrderListSorts("asc")).toEqual([
      { column: "delivery_at", ascending: true, nullsFirst: false },
      { column: "delivery_time", ascending: true, nullsFirst: false },
      { column: "bubble_created_at", ascending: false, nullsFirst: false },
      { column: "created_at", ascending: false },
    ]);
  });
});
