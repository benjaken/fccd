import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseCustomerServiceRagConfig } from "../src/lib/customer-faq";

const page = readFileSync(
  resolve(process.cwd(), "src/components/settings/CustomerFaqPage.tsx"),
  "utf8",
);
const api = readFileSync(resolve(process.cwd(), "src/lib/customer-faq.ts"), "utf8");
const dailyReport = readFileSync(
  resolve(process.cwd(), "supabase/functions/customer-service-daily-report/index.ts"),
  "utf8",
);

describe("customer-service RAG admin flags", () => {
  it("treats an empty rag_config object as all-off", () => {
    expect(parseCustomerServiceRagConfig({})).toEqual({
      enableRagV2: false,
      enableQueryRewrite: false,
      enableGroundedClarification: false,
    });
    expect(parseCustomerServiceRagConfig({
      enable_rag_v2: true,
      enable_query_rewrite: false,
      enable_grounded_clarification: true,
    })).toEqual({
      enableRagV2: true,
      enableQueryRewrite: false,
      enableGroundedClarification: true,
    });
  });

  it("exposes RAG toggles on the FAQ settings page", () => {
    expect(page).toContain("setCustomerServiceConfigRag");
    expect(page).toContain("settings.customerFaq.ragV2");
    expect(page).toContain("settings.customerFaq.ragRewrite");
    expect(page).toContain("settings.customerFaq.ragClarification");
    expect(page).toContain("saveRagFlags");
  });

  it("refreshes embeddings after learning writes", () => {
    expect(api).toContain('if (status === "approved") void refreshCustomerFaqEmbeddings()');
    expect(api).toContain("if (input.createFaqDraft) void refreshCustomerFaqEmbeddings()");
    expect(api).toContain("void refreshCustomerFaqEmbeddings()");
    expect(dailyReport).toContain("refreshPendingFaqEmbeddings");
    expect(dailyReport).toContain("customer-service-faq-embed");
  });
});
