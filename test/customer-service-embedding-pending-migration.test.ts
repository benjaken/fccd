import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260918160000_customer_service_embedding_pending.sql",
  ),
  "utf8",
);

describe("customer-service embedding pending trigger", () => {
  it("marks embeddings pending when FAQ content changes", () => {
    expect(migration).toContain("customer_faqs_mark_embedding_pending");
    expect(migration).toContain("new.embedding_status := 'pending'");
    expect(migration).toContain("new.question is distinct from old.question");
    expect(migration).toContain("new.is_published is distinct from old.is_published");
  });

  it("does not rewrite status on embedding-only updates", () => {
    expect(migration).not.toContain("new.embedding_status is distinct from old.embedding_status");
    expect(migration).toContain("before insert or update on public.customer_faqs");
  });
});
