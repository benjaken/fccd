import { describe, expect, it } from "vitest";

import { evaluateOrderIntakeRules } from "../supabase/functions/_shared/customer-service-order-intake";

const festivalRule = {
  id: "festival",
  name: "中秋接單安排",
  startsOn: "2026-09-25",
  endsOn: "2026-09-27",
  startTime: null,
  endTime: null,
  handling: "allow_only" as const,
  customerMessage: "中秋期間只接受指定品牌及中秋產品。",
  channels: [
    { name: "Food Channels Catering", aliases: ["FCC"], terms: ["中秋套餐", "中秋單點"], url: "https://example.com/fcc" },
    { name: "Food Channels Kitchen", aliases: ["FCK"], terms: ["中秋套餐", "中秋單點"], url: "https://example.com/fck" },
  ],
};

describe("global order-intake rules", () => {
  it("allows an explicitly permitted festival brand and product", () => {
    expect(evaluateOrderIntakeRules({ date: "2026-09-26", text: "想訂 FCC 中秋套餐" }, [festivalRule]).status)
      .toBe("available");
  });

  it("soft-routes an unsupported request and recommends allowed brands", () => {
    const result = evaluateOrderIntakeRules({ date: "2026-09-26", text: "想訂其他品牌普通到會" }, [festivalRule]);
    expect(result.status).toBe("manual_review");
    expect(result.recommendations.map((item) => item.name)).toEqual(["Food Channels Catering", "Food Channels Kitchen"]);
  });

  it("lets a time-specific manual review rule override a date allow-list", () => {
    const result = evaluateOrderIntakeRules({ date: "2026-09-26", time: "17:30", text: "FCC 中秋套餐" }, [
      festivalRule,
      { ...festivalRule, id: "peak", handling: "manual_review", startTime: "17:00", endTime: "18:00", channels: [] },
    ]);
    expect(result.status).toBe("manual_review");
  });

  it("allows normal dates with no special rule", () => {
    expect(evaluateOrderIntakeRules({ date: "2026-09-30", text: "想訂餐" }, [festivalRule]).status)
      .toBe("available");
  });
});
