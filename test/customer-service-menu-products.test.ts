import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  customerServiceMenuProductMatches,
  customerServiceMenuProductReplyText,
} from "../supabase/functions/_shared/customer-service-vision-routing";

type Hit = { name?: string | null; product_url?: string | null };

type Case = {
  id: string;
  description: string;
  terms: string[];
  brand?: string;
  hits: Hit[];
  expect: {
    matchCount: number;
    names?: string[];
    urlContains?: string[];
    replyContains?: string[];
  };
};

const fixture = JSON.parse(
  readFileSync(
    resolve("test/fixtures/customer-service-menu-products/a-la-carte.json"),
    "utf8",
  ),
) as { cases: Case[] };

describe("customer service menu product regression (單點菜式)", () => {
  it("has a non-empty fixture with unique ids", () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
    expect(new Set(fixture.cases.map((item) => item.id)).size).toBe(
      fixture.cases.length,
    );
  });

  for (const testCase of fixture.cases) {
    it(`${testCase.id}: ${testCase.description}`, () => {
      const matches = customerServiceMenuProductMatches(
        testCase.terms,
        testCase.hits,
        testCase.brand ?? "",
      );
      expect(matches).toHaveLength(testCase.expect.matchCount);
      if (testCase.expect.names) {
        expect(matches.map((match) => match.name)).toEqual(
          testCase.expect.names,
        );
      }
      const urls = matches.map((match) => match.productUrl).join("\n");
      for (const url of testCase.expect.urlContains ?? []) {
        expect(urls).toContain(url);
      }

      const reply = customerServiceMenuProductReplyText(
        matches,
        testCase.brand ?? "",
      );
      if (testCase.expect.matchCount === 0) {
        expect(reply).toBe("");
      }
      for (const text of testCase.expect.replyContains ?? []) {
        expect(reply).toContain(text);
      }
    });
  }
});
