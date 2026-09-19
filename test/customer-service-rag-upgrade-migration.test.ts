import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260918120000_customer_service_rag_upgrade.sql",
  ),
  "utf8",
);

describe("customer-service RAG upgrade migration", () => {
  it("adds a JSONB flag bag with a safe default", () => {
    expect(migration).toContain("add column if not exists rag_config jsonb not null default '{}'::jsonb");
    expect(migration).toContain("jsonb_typeof(rag_config) = 'object'");
  });

  it("exposes the flags to the admin list and validates updates", () => {
    expect(migration).toContain("c.rag_config");
    expect(migration).toContain("customer_service_config_set_rag");
    expect(migration).toContain("rag_config_must_be_object");
    expect(migration).toContain("settings.customer_faq.edit");
  });

  it("drops the list RPC before changing its OUT row type", () => {
    expect(migration).toContain(
      "drop function if exists public.customer_service_config_versions_list(text);",
    );
  });

  it("keeps the config functions behind service-role and page access", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("revoke all on function");
    expect(migration).toContain("grant execute on function");
    expect(migration).toContain("private.has_page_access('settings.customer_faq')");
  });
});
