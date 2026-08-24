import { beforeEach, describe, expect, it, vi } from "vitest";

const { festivalQuery, ordersQuery, fromMock } = vi.hoisted(() => {
  const festivalQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
  };
  const ordersQuery = {
    update: vi.fn(),
    in: vi.fn(),
  };
  return {
    festivalQuery,
    ordersQuery,
    fromMock: vi.fn((table: string) => table === "festivals" ? festivalQuery : ordersQuery),
  };
});

vi.mock("@/lib/supabase", () => ({ supabase: { from: fromMock } }));

import { assignFestivalToOrders, isManualTodoTableUnavailable } from "@/lib/order-list-enhancement";

describe("manual order to-do compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    festivalQuery.select.mockReturnValue(festivalQuery);
    festivalQuery.eq.mockReturnValue(festivalQuery);
    festivalQuery.single.mockResolvedValue({
      data: { id: "festival-1", legacy_id: "legacy-festival-1" },
      error: null,
    });
    ordersQuery.update.mockReturnValue(ordersQuery);
    ordersQuery.in.mockResolvedValue({ error: null });
  });

  it.each(["42P01", "PGRST205"])(
    "keeps the main order list available when the optional table returns %s",
    (code) => {
      expect(isManualTodoTableUnavailable({ code })).toBe(true);
    },
  );

  it("does not hide permission or other query failures", () => {
    expect(isManualTodoTableUnavailable({ code: "42501" })).toBe(false);
    expect(isManualTodoTableUnavailable(new Error("network"))).toBe(false);
  });

  it("assigns both festival identifiers to every selected order", async () => {
    await assignFestivalToOrders(["order-1", "order-2"], "festival-1");

    expect(ordersQuery.update).toHaveBeenCalledWith({
      festival_id: "festival-1",
      festival_legacy_id: "legacy-festival-1",
    });
    expect(ordersQuery.in).toHaveBeenCalledWith("id", ["order-1", "order-2"]);
  });
});
