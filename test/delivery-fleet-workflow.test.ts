import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  from: vi.fn(),
  query: {
    select: vi.fn(),
    not: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: database.from },
}));

import { fetchUnassignedDriverDeliveries } from "@/lib/delivery-driver-assignment";

describe("fleet-owned delivery workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.from.mockReturnValue(database.query);
    database.query.select.mockReturnValue(database.query);
    database.query.not.mockReturnValue(database.query);
    database.query.is.mockReturnValue(database.query);
    database.query.in.mockReturnValue(database.query);
    database.query.eq.mockReturnValue(database.query);
    database.query.or.mockReturnValue(database.query);
    database.query.order.mockReturnValue(database.query);
    database.query.range.mockResolvedValue({ data: [], count: 0, error: null });
  });

  it("keeps operations tracking independent of the fleet's internal driver", async () => {
    await fetchUnassignedDriverDeliveries({ page: 1, search: "", teamId: "" });

    expect(database.query.is).not.toHaveBeenCalledWith("subdriver_id", null);
    expect(database.query.in).toHaveBeenCalledWith("delivery_status", [
      "未派車隊",
      "待接單",
      "待取貨",
    ]);
  });

  it("records fleet acceptance separately from physical pickup", () => {
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260822001000_delivery_fleet_acceptance_workflow.sql",
      ),
      "utf8",
    );
    const acceptFunction = migration.match(
      /create or replace function public\.driver_delivery_accept_order[\s\S]*?create or replace function public\.driver_delivery_reject_order/,
    )?.[0];

    expect(acceptFunction).toContain("accepted_at = coalesce");
    expect(acceptFunction).not.toContain("taken_at = now()");
    expect(migration).toMatch(
      /driver_delivery_pickup_order[\s\S]*?set taken_at = now\(\), delivery_status = '已取貨'/,
    );
  });
});
