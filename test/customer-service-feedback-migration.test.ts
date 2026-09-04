import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("customer service human review feedback migration", () => {
  it("upserts by the named primary-key constraint without output-column ambiguity", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260904193000_fix_customer_service_feedback_upsert.sql",
      ),
      "utf8",
    );

    expect(migration).toContain(
      "on conflict on constraint customer_service_turn_feedback_pkey do update",
    );
    expect(migration).not.toContain("on conflict (turn_id) do update");
    expect(migration).toContain("where feedback.turn_id = p_turn_id");
    expect(migration).toContain("settings.customer_faq.edit");
  });

  it("keeps the verdict separate from the explicit learning choice", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260904202000_customer_service_feedback_learning_choice.sql",
      ),
      "utf8",
    );

    expect(migration).toContain(
      "include_in_learning boolean not null default false",
    );
    expect(migration).toContain("p_include_in_learning boolean default false");
    expect(migration).toContain(
      "p_include_in_learning or p_create_faq_draft",
    );
    expect(migration).toContain(
      "on conflict on constraint customer_service_turn_feedback_pkey do update",
    );
  });
});
