import { afterEach, describe, expect, it, vi } from "vitest";

import {
  matchMenuOptionsWithGrok,
  menuNameSimilarity,
  parseMenuTextWithGrok,
  shortlistMenuCatalogCandidates,
} from "../supabase/functions/shopify-order-sync/menu-ai.ts";

const catalog = [
  { id: "p-1", sku: "CP001", name: "雜菌煙肉卡邦尼烤雞扒 (2磅)", channel_id: "catering" },
  { id: "p-2", sku: "CP002", name: "黑椒煙鴨胸炒意粉 (3磅)", channel_id: "catering" },
  { id: "p-3", sku: "CP003", name: "香草焗雞", channel_id: "other" },
];

function enableGrokEnv() {
  vi.stubGlobal("Deno", {
    env: {
      get: (name: string) => ({
        XAI_API_KEY: "test-key",
        SHOPIFY_MENU_AI_MODEL: "grok-test",
      } as Record<string, string>)[name],
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("Shopify menu Grok fallback", () => {
  it("shortlists reordered Traditional Chinese catalog names in the same channel", () => {
    expect(menuNameSimilarity(
      "煙肉卡邦尼烤雞扒配雜菌 (2磅)",
      "雜菌煙肉卡邦尼烤雞扒 (2磅)",
    )).toBeGreaterThan(0.5);
    expect(shortlistMenuCatalogCandidates({
      optionName: "煙肉卡邦尼烤雞扒配雜菌 (2磅)",
      catalog,
      channelId: "catering",
    })[0]?.id).toBe("p-1");
  });

  it("accepts only a high-confidence id from the supplied candidate list", async () => {
    enableGrokEnv();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        matches: [{ optionIndex: 0, candidateId: "p-1", confidence: 0.94 }],
      }) } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const matches = await matchMenuOptionsWithGrok({
      optionNames: ["煙肉卡邦尼烤雞扒配雜菌 (2磅)"],
      catalog,
      channelId: "catering",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(matches.get(0)?.id).toBe("p-1");
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)).response_format.type)
      .toBe("json_schema");
  });

  it("rejects an invented catalog id even when Grok claims high confidence", async () => {
    enableGrokEnv();
    const matches = await matchMenuOptionsWithGrok({
      optionNames: ["煙肉卡邦尼烤雞扒配雜菌 (2磅)"],
      catalog,
      channelId: "catering",
      fetchImpl: async () => new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          matches: [{ optionIndex: 0, candidateId: "invented-id", confidence: 1 }],
        }) } }],
      }), { status: 200 }) as never,
    });
    expect(matches.size).toBe(0);
  });

  it("rejects parsed dishes that are not exact evidence in the Shopify text", async () => {
    enableGrokEnv();
    const source = "必選:\n甜豆雜菌炒「植物肉絲」(2磅)";
    const parsed = await parseMenuTextWithGrok(source, async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        items: [{ name: "精緻中式盛宴 (8-10人)", quantity: 1 }],
      }) } }],
    }), { status: 200 }) as never);
    expect(parsed).toBeNull();
  });
});
