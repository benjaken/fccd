import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260911010000_customer_service_handoffs_auto_resolve_24h.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("customer-service handoffs auto-resolve after 24h", () => {
  it("resolves unresolved handoffs when last customer message is older than 24 hours", () => {
    expect(sql).toContain("customer_service_handoffs_auto_resolve_expired");
    expect(sql).toContain("interval '24 hours'");
    expect(sql).toContain("request.status <> 'resolved'");
    expect(sql).toContain("request.last_customer_message_at <= p_now - p_ttl");
    expect(sql).toContain("status = 'resolved'");
    expect(sql).toContain("逾 24 小時無客戶訊息（WhatsApp 工作階段已結束）自動完成");
  });

  it("returns the conversation to the bot and records system events", () => {
    expect(sql).toContain("customer_service_handoff_events");
    expect(sql).toContain("'resolved'");
    expect(sql).toContain("state = 'identifying'");
    expect(sql).toContain("'system'");
    expect(sql).toContain("mode, reason, actor_id");
    expect(sql).toContain("逾 24 小時無客戶訊息自動完成並交回機器人");
  });

  it("schedules a pg_cron job every 15 minutes", () => {
    expect(sql).toContain("fccd-customer-service-handoffs-auto-resolve");
    expect(sql).toContain("'*/15 * * * *'");
    expect(sql).toContain(
      "select public.customer_service_handoffs_auto_resolve_expired()",
    );
  });
});
