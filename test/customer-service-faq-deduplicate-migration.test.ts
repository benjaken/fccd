import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260904143000_whatsapp_customer_service_faq_deduplicate.sql",
  ),
  "utf8",
);

describe("WhatsApp customer-service FAQ deduplication", () => {
  it("removes repeated localized questions before enforcing uniqueness", () => {
    const deleteDuplicates = sql.indexOf("and ranked.duplicate_number > 1");
    const createUniqueIndex = sql.indexOf(
      "create unique index if not exists customer_faqs_locale_question_uidx",
    );

    expect(sql).toContain("partition by locale, question");
    expect(deleteDuplicates).toBeGreaterThan(-1);
    expect(createUniqueIndex).toBeGreaterThan(deleteDuplicates);
  });
});
