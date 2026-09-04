import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260904182000_expand_customer_service_faq_knowledge.sql",
  ),
  "utf8",
);

const manifest = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "supabase/seeds/customer-faqs-expanded.json"),
    "utf8",
  ),
) as {
  published_count: number;
  draft_count: number;
  policy: { human_intents: string[] };
};

describe("expanded customer service knowledge migration", () => {
  it("keeps the manifest counts synchronized with the migration", () => {
    expect(migration.match(/'zh-HK', true, \d+\)/g)).toHaveLength(
      manifest.published_count,
    );
    expect(migration.match(/'zh-HK', false, \d+\)/g)).toHaveLength(
      manifest.draft_count,
    );
  });

  it("does not expose expired promotions or payment credentials", () => {
    expect(migration).not.toContain("HSBC2024");
    expect(migration).not.toContain("747-221000");
    expect(migration).not.toContain("102938271");
    expect(migration).not.toContain("PayMe 連結");
  });

  it("routes operational questions into human-owned intents", () => {
    expect(manifest.policy.human_intents).toEqual(
      expect.arrayContaining([
        "kitchen_confirmation",
        "complaint_refund",
        "handoff_order",
      ]),
    );
    expect(migration).toContain("('kitchen_confirmation', 'notify_internal', true, true)");
    expect(migration).toContain("('complaint_refund', 'notify_internal', true, true)");
    expect(migration).toContain("https://cs.foodchannels-catering.com/self_service_search");
  });

  it("can be rerun without duplicating handoff examples", () => {
    expect(migration).toContain("group by example");
    expect(migration).toContain("on conflict (locale, question) do nothing");
  });
});
