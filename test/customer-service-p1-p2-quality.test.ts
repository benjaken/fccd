import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260904214000_customer_service_p1_p2_quality.sql",
  "utf8",
);
const webhook = readFileSync(
  "supabase/functions/wati-customer-service/index.ts",
  "utf8",
);
const dailyReport = readFileSync(
  "supabase/functions/customer-service-daily-report/index.ts",
  "utf8",
);

describe("customer service P1/P2 quality controls", () => {
  it("adds a configurable menu intent and auditable human/bot transitions", () => {
    expect(migration).toContain("'browse_menu'");
    expect(migration).toContain("customer_service_conversation_mode_events");
    expect(migration).toContain("後台手動真人接手");
    expect(migration).toContain("後台手動交回機器人");
    expect(webhook).toContain('source: "wati_operator"');
    expect(webhook).toContain("last_human_message");
  });

  it("separates classification confidence from automatic outcome dimensions", () => {
    expect(migration).toContain("classification_confidence");
    expect(migration).toContain("auto_dimensions");
    expect(webhook).toContain("automaticTurnEvaluation");
    expect(webhook).toContain("handoff_correct");
    expect(dailyReport).toContain("wrong_handoff_count");
    expect(dailyReport).toContain("grounded_rate");
  });

  it("gates releases and prevents unsupported AI answers becoming FAQ drafts", () => {
    expect(migration).toContain("evaluation_quality_gate_failed");
    expect(migration).toContain("v_run.sample_size < 5");
    expect(migration).toContain("agreement_rate_delta");
    expect(dailyReport).toContain("groundedAnswer");
    expect(dailyReport).toContain("evaluationOutcome.get(id) === \"success\"");
    expect(dailyReport).toContain("item.evidenceTurnIds.length > 0");
  });
});
