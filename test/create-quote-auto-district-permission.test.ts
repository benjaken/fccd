import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260910053000_create_quote_auto_district_via_option_rpc.sql",
  ),
  "utf8",
);

const quoteEditor = readFileSync(
  path.resolve(process.cwd(), "src/lib/quote-editor.ts"),
  "utf8",
);

describe("create_quote auto district permission fix", () => {
  it("routes missing district names through create_delivery_district_option", () => {
    expect(migration).toContain(
      "from public.create_delivery_district_option(btrim(p_district_name)) as option",
    );
    expect(migration).not.toMatch(
      /insert into public\.delivery_districts\s*\(\s*id,\s*legacy_id,\s*name\s*\)/,
    );
    expect(migration).toContain("('門市自取')");
    expect(migration).toContain("('品酒室')");
    expect(migration).toContain("('寫字樓')");
    expect(migration).toContain("grant execute on function public.create_quote(");
    expect(migration).toContain(") to authenticated;");
  });

  it("resolves quote and order districts through the security-definer option helper", () => {
    expect(quoteEditor).toContain(
      'import { createDeliveryDistrictOption } from "@/lib/delivery-districts"',
    );
    expect(quoteEditor).toContain("await createDeliveryDistrictOption(input.districtName)");
    expect(quoteEditor).not.toContain("web-auto-district-");
    expect(quoteEditor).not.toMatch(
      /\.from\("delivery_districts"\)\s*\n\s*\.insert\(/,
    );
  });
});

describe("quote editor save error interception", () => {
  const page = readFileSync(
    path.resolve(process.cwd(), "src/components/QuoteEditorPage.tsx"),
    "utf8",
  );

  it("classifies create failures instead of always showing the permissions copy", () => {
    expect(page).toContain("classifyQuoteSaveError(cause)");
    expect(page).toContain("isQuoteSaveErrorKey(error)");
    expect(page).not.toContain('setError("quote_create_failed")');
    expect(page).toContain("t(`quoteEditor.errors.${error}`)");
    expect(page).not.toMatch(
      /\{error && <p className="quote-editor-error" role="alert">\{t\("quoteEditor\.errors\.create"\)\}<\/p>\}/,
    );
  });
});
