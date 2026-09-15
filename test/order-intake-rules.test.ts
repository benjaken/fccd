import { describe, expect, it } from "vitest";

import {
  sortOrderIntakeRulesByProximity,
  type OrderIntakeRuleSetting,
} from "@/lib/order-intake-rules";

function rule(id: string, startsOn: string, endsOn = startsOn): OrderIntakeRuleSetting {
  return {
    id,
    name: id,
    startsOn,
    endsOn,
    startTime: null,
    endTime: null,
    handling: "manual_review",
    addonHandling: "manual_review",
    customerMessage: null,
    internalNote: null,
    isActive: true,
    channels: [],
  };
}

describe("order-intake rule sorting", () => {
  it("shows the nearest current or upcoming dates first and moves expired dates behind them", () => {
    const rows = [
      rule("oldest", "2024-12-21"),
      rule("far-future", "2026-12-25"),
      rule("recent-past", "2026-09-10"),
      rule("today", "2026-09-15"),
      rule("near-future", "2026-09-26"),
    ];

    expect(sortOrderIntakeRulesByProximity(rows, "2026-09-15").map((item) => item.id)).toEqual([
      "today",
      "near-future",
      "far-future",
      "recent-past",
      "oldest",
    ]);
  });
});
