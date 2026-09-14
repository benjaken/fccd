import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260914162000_customer_service_faq_match_scoring.sql",
  ),
  "utf8",
);

describe("customer-service FAQ match scoring migration", () => {
  it("ranks phrase and multiple-keyword matches above one generic keyword", () => {
    expect(migration).toContain("keyword_match.matched_count >= 2 then 6.0");
    expect(migration).toContain("keyword_match.longest_match >= 4 then 4.0");
    expect(migration).toContain("keyword_match.matched_count = 1 then 0.25");
  });

  it("keeps retrieval limited to published FAQ rows", () => {
    expect(migration).toContain("where faq.is_published");
    expect(migration).toContain("security definer");
    expect(migration).toContain("revoke all on function");
  });
});
