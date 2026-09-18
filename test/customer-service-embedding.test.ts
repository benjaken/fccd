import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CUSTOMER_SERVICE_EMBEDDING_DIMENSIONS,
  customerServiceEmbeddingConfig,
  embedCustomerServiceQuery,
  embedCustomerServiceTexts,
} from "../supabase/functions/_shared/customer-service-embedding.ts";

const config = {
  enabled: true,
  apiStyle: "openai" as const,
  endpoint: "https://api.example.test/v1/embeddings",
  apiKey: "test-key",
  model: "text-embedding-3-small",
  dimensions: 1536,
  sendDimensions: true,
  timeoutMs: 2_000,
  batchSize: 64,
};

function embeddingResponse(count: number, dimensions = config.dimensions) {
  return new Response(JSON.stringify({
    data: Array.from({ length: count }, (_, index) => ({
      index,
      embedding: Array.from({ length: dimensions }, () => 0.01),
    })),
  }), { status: 200 });
}

describe("customer-service embedding client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to the 1024-d column used by retrieval", () => {
    expect(CUSTOMER_SERVICE_EMBEDDING_DIMENSIONS).toBe(1024);
  });

  it("stays disabled when only OPENAI_API_KEY is present", () => {
    vi.stubGlobal("Deno", {
      env: {
        get: (name: string) => name === "OPENAI_API_KEY" ? "sk-test" : "",
      },
    });
    expect(customerServiceEmbeddingConfig().enabled).toBe(false);
    vi.unstubAllGlobals();
  });

  it("enables with a dedicated embedding key", () => {
    vi.stubGlobal("Deno", {
      env: {
        get: (name: string) => name === "CUSTOMER_SERVICE_EMBEDDING_API_KEY" ? "ark-key" : "",
      },
    });
    const config = customerServiceEmbeddingConfig();
    expect(config.enabled).toBe(true);
    expect(config.apiKey).toBe("ark-key");
    expect(config.dimensions).toBe(1024);
    vi.unstubAllGlobals();
  });

  it("embeds a query with the configured model and dimensions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(embeddingResponse(1));
    const embedding = await embedCustomerServiceQuery("點樣退錢？", {
      config,
      fetchImpl: fetchMock,
    });
    expect(embedding).toHaveLength(1536);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.model).toBe("text-embedding-3-small");
    expect(request.dimensions).toBe(1536);
    expect(request.input).toEqual(["點樣退錢？"]);
  });

  it("batches large inputs", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body as string);
      return embeddingResponse(body.input.length);
    });
    const embeddings = await embedCustomerServiceTexts(["a", "b", "c"], {
      config: { ...config, batchSize: 2 },
      fetchImpl: fetchMock,
    });
    expect(embeddings).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).input).toHaveLength(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).input).toHaveLength(1);
  });

  it("rejects an embedding with the wrong dimension", async () => {
    const fetchMock = vi.fn().mockResolvedValue(embeddingResponse(1, 3));
    await expect(embedCustomerServiceTexts(["a"], { config, fetchImpl: fetchMock }))
      .rejects.toThrow("customer_service_embedding_dimension_mismatch");
  });

  it("returns null instead of throwing when the query provider fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    await expect(embedCustomerServiceQuery("運費？", { config, fetchImpl: fetchMock }))
      .resolves.toBeNull();
  });

  it("refuses to call a provider that is not configured", async () => {
    const fetchMock = vi.fn();
    await expect(embedCustomerServiceTexts(["a"], {
      config: { ...config, apiKey: "" },
      fetchImpl: fetchMock,
    })).rejects.toThrow("customer_service_embedding_not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("supports the Ark multimodal style used by Doubao", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { object: "embedding", embedding: Array.from({ length: 1024 }, () => 0.02) },
    }), { status: 200 }));
    const embedding = await embedCustomerServiceQuery("退款流程", {
      config: {
        ...config,
        apiStyle: "ark_multimodal",
        endpoint: "https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal",
        model: "doubao-embedding-vision-251215",
        dimensions: 1024,
        batchSize: 10,
      },
      fetchImpl: fetchMock,
    });
    expect(embedding).toHaveLength(1024);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.model).toBe("doubao-embedding-vision-251215");
    expect(request.dimensions).toBe(1024);
    expect(request.encoding_format).toBe("float");
    expect(request.input).toEqual([{ type: "text", text: "退款流程" }]);
  });
});
