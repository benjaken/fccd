import { describe, expect, it, vi } from "vitest";

import {
  evaluateOrderIntakeRules,
  evaluateOrderIntakeWithCatalog,
  findOrderIntakeRecommendation,
  findUnavailableRequestedChannel,
} from "../supabase/functions/_shared/customer-service-order-intake";

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
    { name: "Food Channels Catering", aliases: ["FCC"], terms: ["中秋套餐", "中秋單點"] },
    { name: "Food Channels Kitchen", aliases: ["FCK"], terms: ["中秋套餐", "中秋單點"] },
  ],
};

describe("global order-intake rules", () => {
  it.each([
    ["中秋", "2026-09-26", "中秋套餐"],
    ["聖誕", "2026-12-25", "聖誕火雞"],
    ["春節", "2027-02-06", "新春盆菜"],
  ])("applies %s using configured dates and products", (_festival, date, product) => {
    const rule = { ...festivalRule, startsOn: date, endsOn: date, channels: [{ name: "品牌A", terms: [product] }] };
    expect(evaluateOrderIntakeRules({ date, text: `品牌A ${product}` }, [rule]).status).toBe("available");
    expect(evaluateOrderIntakeRules({ date, text: "品牌A 普通套餐" }, [rule]).status).toBe("manual_review");
  });
  it("searches each brand only with its own terms and never recommends cross-brand products", async () => {
    const rule = { ...festivalRule, channels: [
      { channelId: "a", name: "品牌A", terms: ["聖誕火雞"] },
      { channelId: "b", name: "品牌B", terms: ["新春盆菜"] },
    ] };
    const catalog = [
      { channel: "a", name: "聖誕火雞", url: "https://a/turkey" },
      { channel: "a", name: "新春盆菜", url: "https://a/pot" },
      { channel: "b", name: "新春盆菜", url: "https://b/pot" },
    ];
    const search = vi.fn(async (channel: string, terms: string[]) => catalog.filter((item) => item.channel === channel && terms.includes(item.name)));
    const result = await evaluateOrderIntakeWithCatalog({ date: "2026-09-26", text: "我想訂聖誕火雞" }, [rule], search);
    expect(search).toHaveBeenCalledWith("a", ["聖誕火雞"]);
    expect(search).toHaveBeenCalledWith("b", ["新春盆菜"]);
    expect(result.recommendations.map((item) => item.url)).toEqual(["https://a/turkey", "https://b/pot"]);
    expect(result.status).toBe("available");
    const wrongBrand = await evaluateOrderIntakeWithCatalog({ date: "2026-09-26", text: "我想訂品牌A新春盆菜" }, [rule], search);
    expect(wrongBrand.status).toBe("manual_review");
  });
  it("requires every overlapping allow-list and keeps manual review dominant", async () => {
    const first = { ...festivalRule, channels: [{ channelId: "a", name: "品牌A", terms: ["火雞"] }] };
    const second = { ...first, id: "second", channels: [{ channelId: "a", name: "品牌A", terms: ["盆菜"] }] };
    expect(evaluateOrderIntakeRules({ date: "2026-09-26", text: "品牌A 火雞" }, [first, second]).status).toBe("manual_review");
    const result = await evaluateOrderIntakeWithCatalog({ date: "2026-09-26", text: "品牌A 火雞" }, [first, second], async (_channel, terms) => terms.map((name) => ({ name, url: `https://a/${name}` })));
    expect(result.recommendations).toEqual([]);
    expect(result.status).toBe("manual_review");
    expect(result).toMatchObject({
      recognizedChannelName: "品牌A",
      allowedProductTermGroups: [["火雞"], ["盆菜"]],
      needsProductSelection: true,
    });
  });
  it("requires a time even when the only date rule applies to a time range", () => {
    const rule = { ...festivalRule, handling: "manual_review" as const, startTime: "17:00", endTime: "19:00" };
    expect(evaluateOrderIntakeRules({ date: "2026-09-26", text: "想訂餐" }, [rule]).requiresTime).toBe(true);
    expect(evaluateOrderIntakeRules({ date: "2026-09-26", time: "17:00", text: "想訂餐" }, [rule]).status).toBe("manual_review");
    expect(evaluateOrderIntakeRules({ date: "2026-09-26", time: "19:00", text: "想訂餐" }, [rule]).status).toBe("available");
  });
  it("allows an explicitly permitted festival brand and product", () => {
    expect(evaluateOrderIntakeRules({ date: "2026-09-26", text: "想訂 FCC 中秋套餐" }, [festivalRule]).status)
      .toBe("available");
  });

  it("reports a recognized brand separately from a missing allowed product", () => {
    const result = evaluateOrderIntakeRules({ date: "2026-09-26", text: "想訂 FCC 到會" }, [festivalRule]);
    expect(result).toMatchObject({
      status: "manual_review",
      recognizedChannelName: "Food Channels Catering",
      allowedProductTerms: ["中秋套餐", "中秋單點"],
      needsProductSelection: true,
    });
  });

  it("soft-routes an unsupported request and recommends allowed brands", () => {
    const result = evaluateOrderIntakeRules({ date: "2026-09-26", text: "想訂其他品牌普通到會" }, [festivalRule]);
    expect(result.status).toBe("manual_review");
    expect(result.recommendations).toEqual([
      { name: "Food Channels Catering", url: null },
      { name: "Food Channels Kitchen", url: null },
    ]);
  });

  it("lets a time-specific manual review rule override a date allow-list", () => {
    const peakRule = {
      ...festivalRule,
      id: "peak",
      handling: "manual_review" as const,
      startTime: "17:00",
      endTime: "19:00",
      channels: [],
      customerMessage: "17:00至19:00暫不接受自動落單，請留下需求。",
    };
    const result = evaluateOrderIntakeRules({ date: "2026-09-26", time: "18:59", text: "FCC 中秋套餐" }, [
      festivalRule,
      peakRule,
    ]);
    expect(result.status).toBe("manual_review");
    expect(result.message).toContain("17:00至19:00");
    expect(evaluateOrderIntakeRules(
      { date: "2026-09-26", text: "FCC 中秋套餐" },
      [festivalRule, peakRule],
    ).status).toBe("available");
    expect(evaluateOrderIntakeRules(
      { date: "2026-09-26", time: "19:00", text: "FCC 中秋套餐" },
      [festivalRule, peakRule],
    ).status).toBe("available");
  });

  it("allows normal dates with no special rule", () => {
    expect(evaluateOrderIntakeRules({ date: "2026-09-30", text: "想訂餐" }, [festivalRule]).status)
      .toBe("available");
  });

  it("recognizes a named unavailable brand without confusing it with an allowed brand", () => {
    expect(findUnavailableRequestedChannel(
      "我想問9月26號 Lunchbox",
      [
        { id: "catering", name: "Catering" },
        { id: "kitchen", name: "Kitchen" },
        { id: "lunchbox", name: "HK lunch box" },
      ],
      ["catering", "kitchen"],
    )).toEqual({ id: "lunchbox", name: "HK lunch box" });
  });

  it("recognizes a customer selecting a recommended seasonal product", () => {
    expect(findOrderIntakeRecommendation(
      "我想訂中式中秋盛宴 (15-20人)",
      [{
        name: "【2026中秋節到會】中式中秋盛宴 (15-20人)",
        url: "https://example.com/ccma1520",
      }],
    )).toEqual({
      name: "【2026中秋節到會】中式中秋盛宴 (15-20人)",
      url: "https://example.com/ccma1520",
    });
  });
});
