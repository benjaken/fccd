import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/wati-customer-service/index.ts"),
  "utf8",
);

describe("customer-service backend conversation preview", () => {
  it("requires an authenticated FAQ-page user and keeps preview writes dry", () => {
    expect(source).toContain('if (payload.mode === "preview")');
    expect(source).toContain('userClient.rpc("customer_service_controls_get")');
    expect(source).toContain("deps: createBotDeps(admin, { dryRun: true })");
    expect(source).toContain("if (dryRun) return;");
    expect(source).toContain('order_number: "PREVIEW"');
    expect(source).toContain("beforeRequest: dryRun || !phone");
  });

  it("returns conversation state and AI or handoff evidence to the UI", () => {
    expect(source).toContain("conversation: turn.conversation");
    expect(source).toContain("used_model: turn.usedModel");
    expect(source).toContain('human_handoff: turn.conversation.state === "human_owned"');
    expect(source).toContain("simulated_notify: turn.notified");
  });

  it("sends a best-effort waiting notice before a real AI request", () => {
    expect(source).toContain('const AI_WAITING_REPLY = "收到，我正在查詢相關資料，請稍等一會 🙏"');
    expect(source).toContain("text: AI_WAITING_REPLY");
    expect(source).toContain("deps: createBotDeps(admin, { phone: event.waId })");
    expect(source).toContain('"wati AI waiting notice failed"');
  });
});
