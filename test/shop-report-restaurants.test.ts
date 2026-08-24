import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchShopReportRestaurants } from "@/lib/shop-sales-working-hours-report";

const database = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  is: vi.fn(),
  order: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: database.from },
}));

describe("shop report restaurant options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.from.mockReturnValue({ select: database.select });
    database.select.mockReturnValue({ is: database.is });
    database.is.mockReturnValue({ order: database.order });
    database.order.mockResolvedValue({
      data: [
        { id: "open", name: "Open restaurant" },
        { id: "closed", name: "Closed restaurant" },
      ],
      error: null,
    });
  });

  it("includes closed restaurants while excluding archived restaurants", async () => {
    await expect(fetchShopReportRestaurants()).resolves.toEqual([
      { id: "open", name: "Open restaurant" },
      { id: "closed", name: "Closed restaurant" },
    ]);

    expect(database.from).toHaveBeenCalledWith("restaurants");
    expect(database.is).toHaveBeenCalledWith("archived_at", null);
  });
});
