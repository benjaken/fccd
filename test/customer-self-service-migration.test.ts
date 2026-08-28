import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260827200000_customer_self_service_portal.sql"),
  "utf8",
);

describe("customer self-service portal migration", () => {
  it("keeps customer data behind short-lived, hashed sessions", () => {
    expect(sql).toContain("private.customer_self_service_sessions");
    expect(sql).toContain("expires_at timestamptz not null default now() + interval '30 minutes'");
    expect(sql).toContain("digest(v_phone, 'sha256')");
    expect(sql).toContain("digest(v_email, 'sha256')");
    expect(sql).toContain("private.self_service_order_matches");
  });

  it("requires both phone and email and rate limits lookups", () => {
    expect(sql).toContain("session.phone_hash = v_phone_hash");
    expect(sql).toContain("session.email_hash = v_email_hash");
    expect(sql).toContain("count(*) >= 5");
    expect(sql).toMatch(/lower\(btrim\(coalesce\(orders\.email_snapshot, ''\)\)\) = v_email[\s\S]*self_service_phone\(orders\.contact_number_a_snapshot\) = v_phone/);
  });

  it("exposes only the guarded RPCs to anonymous customers", () => {
    expect(sql).toContain("revoke all on private.customer_self_service_sessions from public, anon, authenticated");
    expect(sql).toContain("security definer");
    expect(sql).toContain("grant execute on function public.customer_self_service_login(text, text) to anon, authenticated");
    expect(sql).toContain("grant execute on function public.customer_self_service_order_detail(uuid, uuid) to anon, authenticated");
  });
});
