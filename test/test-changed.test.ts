import { describe, expect, it } from "vitest";

import {
  kebabCase,
  selectRelatedTests,
  sourceStems,
} from "../scripts/test-changed.mjs";

const tests = [
  "test/quote-editor-page.test.tsx",
  "test/quote-save-error-classification.test.ts",
  "test/order-delivery-lifecycle.test.ts",
  "test/create-quote-auto-district-permission.test.ts",
  "test/sales-document-batch-save.test.ts",
  "test/kitchen-orders-page.test.tsx",
];

const texts: Record<string, string> = {
  "test/quote-editor-page.test.tsx": `from "@/lib/quote-editor"; from "@/components/QuoteEditorPage"; 09-orders-quotes.css`,
  "test/quote-save-error-classification.test.ts": `from "@/lib/quote-editor";`,
  "test/order-delivery-lifecycle.test.ts": `from "@/lib/quote-editor";`,
  "test/create-quote-auto-district-permission.test.ts": `create_quote_auto_district_via_option_rpc`,
  "test/sales-document-batch-save.test.ts": `save_sales_document_batch`,
  "test/kitchen-orders-page.test.tsx": `KitchenOrdersPage`,
};

function related(changed: string[]) {
  return selectRelatedTests(changed, tests, (file) => texts[file] ?? "");
}

describe("test:changed mapping", () => {
  it("kebabs component and migration names", () => {
    expect(kebabCase("QuoteEditorPage")).toBe("quote-editor-page");
    expect(sourceStems("supabase/migrations/20260910053000_create_quote_auto_district_via_option_rpc.sql"))
      .toContain("create-quote-auto-district-via-option-rpc");
  });

  it("maps a lib module to tests that import it", () => {
    expect(related(["src/lib/quote-editor.ts"])).toEqual([
      "test/order-delivery-lifecycle.test.ts",
      "test/quote-editor-page.test.tsx",
      "test/quote-save-error-classification.test.ts",
    ]);
  });

  it("maps a page component by filename", () => {
    expect(related(["src/components/QuoteEditorPage.tsx"])).toEqual([
      "test/quote-editor-page.test.tsx",
    ]);
  });

  it("includes the page test when a supporting lib changes", () => {
    expect(related(["src/lib/quote-editor.ts"])).toContain("test/quote-editor-page.test.tsx");
  });

  it("maps a changed test file to itself", () => {
    expect(related(["test/quote-editor-page.test.tsx"])).toEqual([
      "test/quote-editor-page.test.tsx",
    ]);
  });

  it("maps a district migration to the permission test", () => {
    expect(related([
      "supabase/migrations/20260910053000_create_quote_auto_district_via_option_rpc.sql",
    ])).toEqual([
      "test/create-quote-auto-district-permission.test.ts",
    ]);
  });

  it("does not fan i18n out to the whole suite", () => {
    expect(related(["src/i18n.ts"])).toEqual([]);
  });

  it("ignores docs-only commits", () => {
    expect(related(["README.md", "CONTRIBUTING.md", "package.json"])).toEqual([]);
  });
});
