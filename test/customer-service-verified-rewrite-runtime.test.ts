import { describe, expect, it, vi } from "vitest";
import { createCustomerServiceFaqRagDeps } from
  "../supabase/functions/_shared/customer-service-rag-runtime";
import type { CustomerServiceRagDatabase } from
  "../supabase/functions/_shared/customer-service-rag-db";

const ragConfig = {
  enableRagV2: false, enableQueryRewrite: false, enableGroundedClarification: false,
  contextRounds: 2, lexicalTopK: 5, vectorTopK: 5, finalTopK: 5,
  rrfK: 60, vectorWeight: 0.7, lexicalWeight: 0.3, vectorThreshold: 0.45,
};

describe("verified rewrite at the live FAQ retrieval point", () => {
  it("uses the published FAQ question for retrieval without changing the customer answer input", async () => {
    const rpc = vi.fn((name: string, args: Record<string, unknown>) => Promise.resolve({
      data: name === "customer_service_verified_rewrite" ? "送貨範圍？" : [{
        id: "faq-1", question: "送貨範圍？", answer: "港島及九龍", category: "delivery",
      }], error: null,
    }));
    const runtime = createCustomerServiceFaqRagDeps({
      db: { rpc } as CustomerServiceRagDatabase, ragConfig,
      tiers: {} as never, embeddingConfig: { enabled: false } as never,
      environment: "develop", onTrace: () => {},
    });
    expect((await runtime.searchFaqs("有冇送貨？"))[0].id).toBe("faq-1");
    expect(rpc).toHaveBeenCalledWith("customer_service_verified_rewrite",
      { p_environment: "develop", p_query: "有冇送貨？" });
    expect(rpc).toHaveBeenCalledWith("search_published_customer_faqs",
      { p_query: "送貨範圍？", p_limit: 12 });
  });

  it("keeps ordinary retrieval when the rule lookup is unavailable", async () => {
    const rpc = vi.fn((name: string) => Promise.resolve({
      data: name === "customer_service_verified_rewrite" ? null : [],
      error: name === "customer_service_verified_rewrite" ? { message: "unavailable" } : null,
    }));
    const runtime = createCustomerServiceFaqRagDeps({
      db: { rpc } as CustomerServiceRagDatabase, ragConfig,
      tiers: {} as never, embeddingConfig: { enabled: false } as never,
      environment: "develop", onTrace: () => {},
    });
    expect(await runtime.searchFaqs("有冇送貨？")).toEqual([]);
    expect(rpc).toHaveBeenCalledWith("search_published_customer_faqs",
      { p_query: "有冇送貨？", p_limit: 12 });
  });

  it("bypasses an active rewrite whenever RAG is forced off", async () => {
    const rpc = vi.fn((name: string) => Promise.resolve({
      data: name === "customer_service_verified_rewrite" ? "送貨範圍？" : [], error: null,
    }));
    const runtime = createCustomerServiceFaqRagDeps({
      db: { rpc } as CustomerServiceRagDatabase, ragConfig: { ...ragConfig, forceOff: true },
      tiers: {} as never, embeddingConfig: { enabled: false } as never,
      environment: "develop", onTrace: () => {},
    });
    await runtime.searchFaqs("有冇送貨？");
    expect(rpc).not.toHaveBeenCalledWith("customer_service_verified_rewrite", expect.anything());
    expect(rpc).toHaveBeenCalledWith("search_published_customer_faqs",
      { p_query: "有冇送貨？", p_limit: 12 });
  });
});
