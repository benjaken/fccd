import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260901173000_include_quote_event_parts_in_totals.sql",
  ),
  "utf8",
);
const quoteEditorImplementation = readFileSync(
  join(process.cwd(), "src/lib/quote-editor.ts"),
  "utf8",
);

describe("quote event-part total migration", () => {
  it("includes activity prices whenever a sales document total is recalculated", () => {
    expect(migration).toMatch(/sum\(event\.price_snapshot\)/i);
    expect(migration).toMatch(/from public\.order_bento_event_parts event/i);
    expect(migration).toMatch(/where event\.order_id = p_order_id/i);
  });

  it("copies Bubble additional information and activities during conversion", () => {
    expect(migration).toMatch(/copy_quote_supplements_on_order_insert/i);
    expect(migration).toMatch(/insert into public\.order_bento_additional_items/i);
    expect(migration).toMatch(/insert into public\.order_bento_event_parts/i);
    expect(migration).toMatch(/new\.source_quote_id/i);
  });

  it("uses the activity-aware database recalculation after an explicit line edit", () => {
    const updateLineImplementation = quoteEditorImplementation.slice(
      quoteEditorImplementation.indexOf("export async function updateQuoteLine("),
      quoteEditorImplementation.indexOf("export async function updateQuoteLineOrder("),
    );

    expect(updateLineImplementation).toContain('supabase.rpc("update_quote_financials"');
    expect(updateLineImplementation).not.toContain('select("total_price")');
  });
});
