import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260914183000_customer_service_handoff_auto_return_15m.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("customer-service handoff auto-return after 15 minutes", () => {
  it("uses the latest customer or human activity for an owned conversation", () => {
    expect(sql).toContain("interval '15 minutes'");
    expect(sql).toContain("request.status = 'in_progress'");
    expect(sql).toContain("conversation.state = 'human_owned'");
    expect(sql).toContain("message.role in ('customer', 'human')");
    expect(sql).toContain("public.customer_service_inbound_events");
    expect(sql).toContain("inbound.received_at");
    expect(sql).toContain("activity.last_message_at");
    expect(sql).toContain("<= p_now - p_ttl");
  });

  it("keeps the 24-hour expiry for handoffs that staff have not claimed", () => {
    expect(sql).toContain("request.status <> 'in_progress'");
    expect(sql).toContain("interval '24 hours'");
  });

  it("returns the conversation to the bot and checks every minute", () => {
    expect(sql).toContain("state = 'identifying'");
    expect(sql).toContain("真人接管後連續 15 分鐘無新訊息，自動交回機器人");
    expect(sql).toContain("'* * * * *'");
  });

  it("only returns control while the configured auto-reply window is open", () => {
    expect(sql).toContain("private.customer_service_auto_reply_window_open");
    expect(sql).toContain("controls.bot_enabled");
    expect(sql).toContain("controls.auto_reply_timezone");
    expect(sql).toContain("controls.weekday_auto_reply_start");
    expect(sql).toContain("controls.saturday_auto_reply_start");
    expect(sql).toContain("controls.sunday_auto_reply_start");
    expect(sql).toContain(
      "and private.customer_service_auto_reply_window_open(p_now)",
    );
  });
});
