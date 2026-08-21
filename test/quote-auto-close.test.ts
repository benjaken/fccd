import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260821017000_auto_close_expired_quote_follow_ups.sql",
  ),
  "utf8",
);

describe("expired quote follow-up automation", () => {
  it("closes only open, unarchived quotes with a valid elapsed dispatch time", () => {
    expect(migration).toContain("orders.document_type = 'quote'");
    expect(migration).toContain("orders.archived_at is null");
    expect(migration).toContain("orders.delivery_at is not null");
    expect(migration).toContain("orders.quote_status not in ('Done Deal', 'Case Closed')");
    expect(migration).toContain("regexp_match(");
    expect(migration).toContain("at time zone 'Asia/Hong_Kong'");
    expect(migration).toContain("quote_status = 'Case Closed'");
  });

  it("runs immediately on deployment and every five minutes afterwards", () => {
    expect(migration).toContain("select public.close_expired_quote_follow_ups();");
    expect(migration).toContain("'fccd-close-expired-quote-follow-ups'");
    expect(migration).toContain("'*/5 * * * *'");
  });

  it("does not expose the maintenance function to application roles", () => {
    expect(migration).toContain(
      "revoke all on function public.close_expired_quote_follow_ups(timestamptz) from anon;",
    );
    expect(migration).toContain(
      "revoke all on function public.close_expired_quote_follow_ups(timestamptz) from authenticated;",
    );
  });
});
