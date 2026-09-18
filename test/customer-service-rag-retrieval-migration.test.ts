import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260918130000_customer_service_rag_retrieval.sql",
  ),
  "utf8",
);

describe("customer-service semantic FAQ retrieval migration", () => {
  it("stores 1536-dimension embeddings with an HNSW cosine index", () => {
    expect(migration).toContain("create extension if not exists vector");
    expect(migration).toContain("embedding vector(1536) not null");
    expect(migration).toContain("using hnsw (embedding vector_cosine_ops)");
    expect(migration).toContain("create table if not exists public.customer_faq_embeddings");
  });

  it("tracks embedding freshness on the FAQ row", () => {
    expect(migration).toContain("add column if not exists embedding_status");
    expect(migration).toContain("customer_faqs_embedding_status_check");
    expect(migration).toContain("'pending', 'ready', 'failed', 'stale'");
  });

  it("exposes a service-role cosine similarity search over published FAQs", () => {
    expect(migration).toContain("search_published_customer_faqs_by_vector");
    expect(migration).toContain("(1 - (e.embedding <=> v_embedding))");
    expect(migration).toContain("join public.customer_faqs f on f.id = b.faq_id and f.is_published");
    expect(migration).toContain("security definer");
    expect(migration).toContain("to service_role");
  });

  it("defines similar and negative alias storage", () => {
    expect(migration).toContain("create table if not exists public.customer_faq_aliases");
    expect(migration).toContain("alias_type in ('similar', 'negative')");
  });
});
