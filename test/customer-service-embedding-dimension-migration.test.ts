import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260918140000_customer_service_embedding_dimension.sql",
  ),
  "utf8",
);

describe("customer-service embedding dimension migration", () => {
  it("resizes the vector column to the Doubao dimension", () => {
    expect(migration).toContain("alter column embedding type vector(1024)");
    expect(migration).toContain("customer_faq_embeddings_hnsw_idx");
    expect(migration).toContain("using hnsw (embedding vector_cosine_ops)");
  });

  it("clears stale embeddings and marks FAQs for re-embedding", () => {
    expect(migration).toContain("delete from public.customer_faq_embeddings");
    expect(migration).toContain("set embedding_status = 'pending'");
  });

  it("recreates the cosine search RPC against the new dimension", () => {
    expect(migration).toContain("search_published_customer_faqs_by_vector");
    expect(migration).toContain("v_embedding vector(1024)");
    expect(migration).toContain("p_query_embedding::vector(1024)");
    expect(migration).toContain("to service_role");
  });
});
