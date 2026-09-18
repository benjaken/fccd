import { describe, expect, it } from "vitest";

import {
  buildFaqEmbeddingText,
  faqEmbeddingContentHash,
} from "../supabase/functions/_shared/customer-service-embedding-content.ts";

describe("customer-service FAQ embedding content", () => {
  it("embeds the question and similar aliases without the answer by default", () => {
    const text = buildFaqEmbeddingText({
      question: "退款流程",
      aliases: ["點樣退錢", "可唔可以退返錢"],
      answer: "請提供訂單號，一般 7 個工作天內處理。",
    });
    expect(text).toBe("退款流程\n可唔可以退返錢\n點樣退錢");
    expect(text).not.toContain("7 個工作天");
  });

  it("includes the answer only when explicitly requested", () => {
    const text = buildFaqEmbeddingText({
      question: "退款流程",
      answer: "7 個工作天內處理。",
      includeAnswer: true,
    });
    expect(text).toContain("7 個工作天");
  });

  it("produces a stable hash for change detection", () => {
    expect(faqEmbeddingContentHash("退款流程")).toBe(faqEmbeddingContentHash("退款流程"));
    expect(faqEmbeddingContentHash("退款流程")).not.toBe(faqEmbeddingContentHash("退款流程 "));
  });
});
