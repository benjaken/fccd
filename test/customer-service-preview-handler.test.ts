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
    expect(source).toContain('"customer_service_controls_get"');
    expect(source).toContain("dryRun: true");
    expect(source).toContain("replyTemplates: runtime.replyTemplates");
    expect(source).toContain("if (dryRun) return;");
    expect(source).toContain('order_number: "PREVIEW"');
    expect(source).toContain("classify: createCustomerServiceClassifier");
  });

  it("returns conversation state and AI or handoff evidence to the UI", () => {
    expect(source).toContain("conversation: turn.conversation");
    expect(source).toContain("used_model: turn.usedModel");
    expect(source).toContain("related_faqs: turn.relatedFaqs");
    expect(source).toContain("appendRelatedFaqsToReply");
    expect(source).toContain(
      'human_handoff: ["awaiting_human", "human_owned"].includes',
    );
    expect(source).toContain(
      "simulated_notify: Boolean(turn.queuedHandoff || turn.notified)",
    );
    expect(source).toContain("intent_key: turn.intentKey");
  });

  it("does not send a separate waiting notice before an AI request", () => {
    expect(source).not.toContain("AI_WAITING_REPLY");
    expect(source).not.toContain("aiWaitingNotice(phone, dryRun)");
    expect(source).not.toContain('"wati AI waiting notice failed"');
  });

  it("loads database-configured intents, tool permissions, replies, and records live outcomes", () => {
    expect(source).toContain('from("customer_service_intents")');
    expect(source).toContain('from("customer_service_tool_permissions")');
    expect(source).toContain('from("customer_service_reply_templates")');
    expect(source).toContain('from("customer_service_turns").upsert');
    expect(source).toContain("ACTION_TO_REQUIRED_TOOL");
  });

  it("uses AI for business intent and clarifies low-confidence results instead of Regex routing", () => {
    expect(source).toContain("shouldBypassCustomerServiceAi(fallback)");
    expect(source).toContain("confidenceNeedsClarification");
    expect(source).toContain("answerWithoutFaqWithModel");
    expect(source).toContain("answerCustomerServiceFallbackWithTieredAi");
    expect(source).not.toContain('fallback.intent === "out_of_scope"');
  });

  it("supports an optional live automatic-reply allowlist", () => {
    expect(source).toContain("row?.allowed_phones || []");
    expect(source).not.toContain("customer_service_allowed_phones_missing");
    expect(source).toContain("customerServicePhoneAllowed(event.waId, controls.allowedPhones)");
    expect(source).toContain('ignored: "phone_not_allowed"');
    expect(source).not.toContain("notificationRecipientAllowlist");
  });

  it("queues handoffs for the morning digest and sends same-day urgent ones immediately", () => {
    expect(source).toContain("customer_service_handoff_enqueue");
    expect(source).toContain("p_notify_immediately: Boolean(input.urgent)");
    expect(source).toContain('payload.mode === "handoff_digest"');
    expect(source).toContain('admin.rpc("customer_service_handoff_claim"');
    expect(source).toContain('status: "notified"');
    expect(source).toContain("【緊急】WhatsApp 即日訂餐");
    expect(source).toMatch(
      /CUSTOMER_SERVICE_OUTBOUND_CRON_SECRET[\s\S]*CUSTOMER_SERVICE_HANDOFF_CRON_SECRET[\s\S]*WATI_ORDER_CRON_SECRET/,
    );
  });

  it("limits develop internal WATI staff alerts to the pilot phone only", () => {
    expect(source).toContain('const DEVELOP_INTERNAL_WATI_PHONE = "8613828747224"');
    expect(source).toContain("function resolveInternalWatiPhones");
    expect(source).toContain("return [DEVELOP_INTERNAL_WATI_PHONE]");
    expect(source).toContain('environment === "develop" ||');
    expect(source).toContain("environment !== \"develop\"");
  });

  it("keeps guest replies flowing when urgent staff notify fails", () => {
    expect(source).toContain("urgent staff notify failed");
    expect(source).toContain("Never block the guest reply on staff-notify failure");
    expect(source).toContain("Fall back to a session text so staff still get the urgent ping");
    expect(source).toContain("fcc-bot-staff-");
  });
});
