import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260904200000_customer_service_delivery_identity_release.sql",
  ),
  "utf8",
);
const webhook = readFileSync(
  resolve(process.cwd(), "supabase/functions/wati-customer-service/index.ts"),
  "utf8",
);
const evaluator = readFileSync(
  resolve(process.cwd(), "supabase/functions/customer-service-model-evaluate/index.ts"),
  "utf8",
);
const retryScheduleSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260904201000_enable_customer_service_outbound_retry.sql",
  ),
  "utf8",
);

describe("customer service delivery, identity, and release controls", () => {
  it("persists outbound WATI messages and supports bounded retries", () => {
    expect(sql).toContain("customer_service_outbound_messages");
    expect(sql).toContain("customer_service_outbound_claim");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("attempt_count < candidate.max_attempts");
    expect(sql).toContain("customer_service_outbound_retry");
    expect(webhook).toContain("queueOutboundMessage");
    expect(webhook).toContain("withEnvironmentOutboundMarker");
    expect(webhook).toContain('payload.mode === "retry_outbound"');
    expect(webhook).toContain("recordWatiDeliveryEvent");
    expect(retryScheduleSql).toContain("'*/5 * * * *'");
    expect(retryScheduleSql).toContain("customer_service_handoff_digest_url");
  });

  it("sends mapped Shopify media only after the text reply succeeds", () => {
    const completion = webhook.slice(
      webhook.indexOf("async function persistCustomerServiceTurn"),
      webhook.indexOf("function mediaTypeLabel"),
    );
    const textSend = completion.indexOf("await deliverWatiSessionMessage");
    const imageSend = completion.indexOf("await deliverWatiSessionImage");

    expect(textSend).toBeGreaterThanOrEqual(0);
    expect(imageSend).toBeGreaterThan(textSend);
    expect(completion).toContain('caption: "套餐參考圖片"');
    expect(completion).toContain("customer-service image send failed");
  });

  it("verifies both the WhatsApp phone and order email server-side", () => {
    expect(sql).toContain("customer_service_verify_order_identity");
    expect(sql).toContain("lower(btrim(coalesce(orders.email_snapshot, ''))) = v_email");
    expect(sql).toContain("private.self_service_phone(orders.contact_number_a_snapshot) = v_phone");
    expect(sql).toContain("'verifying_order'");
  });

  it("records releases and permits rollback only to a previously released config", () => {
    expect(sql).toContain("customer_service_config_release_events");
    expect(sql).toContain("p_action not in ('activate', 'rollback')");
    expect(sql).toContain("completed_evaluation_required");
    expect(sql).toContain("previous_release_required");
    expect(sql).toContain("customer_service_config_rollback");
  });

  it("evaluates answer, intent, and dialog accuracy before release", () => {
    expect(evaluator).toContain("answerCustomerServiceFaqForEvaluation");
    expect(evaluator).toContain("classifyCustomerServiceWithTieredAi");
    expect(evaluator).toContain("intent_accuracy");
    expect(evaluator).toContain("dialog_action_accuracy");
  });
});
