import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("WATI customer conversations", () => {
  it("sends authenticated session messages and records the outbound message", () => {
    const implementation = source("supabase/functions/send-wati-customer-message/index.ts");

    expect(implementation).toContain("auth.getUser()");
    expect(implementation).toContain("/api/v1/sendSessionMessage/");
    expect(implementation).toContain('message_direction: "outbound"');
    expect(implementation).toContain('communication_channel: "wati"');
    expect(implementation).toContain('Deno.env.get("WATI_CUSTOMER_MESSAGES_ENABLED")');
    expect(implementation).toContain('error: "wati_customer_messages_disabled"');
  });

  it("authenticates and de-duplicates inbound WATI webhooks", () => {
    const implementation = source("supabase/functions/wati-customer-webhook/index.ts");
    const migration = source("supabase/migrations/20260828100000_wati_customer_conversations.sql");

    expect(implementation).toContain('requiredEnv("WATI_WEBHOOK_SECRET")');
    expect(implementation).toContain("isWatiSamplePayload");
    expect(implementation).toContain('eventType !== "message"');
    expect(implementation).toContain('message_direction: "inbound"');
    expect(implementation).toContain('onConflict: "provider_message_id"');
    expect(migration).toContain("unique index if not exists order_timeline_entries_provider_message_id_uidx");
  });
});
