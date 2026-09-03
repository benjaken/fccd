import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_ADDRESS_TRANSLATION_MODEL,
  translateLocationToTraditionalChinese,
} from "../supabase/functions/_shared/location-translation";

describe("location translation provider compatibility", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("retries a provider 400 with portable chat-completions fields", async () => {
    const env = new Map([
      ["ADDRESS_TRANSLATION_AI_ENABLED", "true"],
      ["ADDRESS_TRANSLATION_AI_ENDPOINT", "https://example.test/chat/completions"],
      ["ADDRESS_TRANSLATION_AI_API_KEY", "test-key"],
      ["ADDRESS_TRANSLATION_AI_MODEL", "test-model"],
      ["ADDRESS_TRANSLATION_AI_PROVIDER", "xai"],
    ]);
    vi.stubGlobal("Deno", { env: { get: (name: string) => env.get(name) } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unsupported parameter", { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "```json\n{\"translatedText\":\"中環皇后大道中12號\"}\n```" } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(translateLocationToTraditionalChinese("12 Queen's Road Central", "address"))
      .resolves.toBe("中環皇后大道中12號");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(firstBody).toMatchObject({
      response_format: { type: "json_object" },
      reasoning_effort: "none",
      temperature: 0,
    });
    expect(retryBody).toEqual({
      model: "test-model",
      max_tokens: 400,
      messages: firstBody.messages,
    });
  });

  it("does not inherit the report AI reasoning model", async () => {
    const env = new Map([
      ["REPORT_AI_ENABLED", "true"],
      ["REPORT_AI_ENDPOINT", "https://api.x.ai/v1/chat/completions"],
      ["REPORT_AI_MODEL", "grok-4.6"],
      ["REPORT_AI_PROVIDER", "xai"],
      ["XAI_API_KEY", "correct-xai-key"],
      ["SUPPLIER_QUOTE_AI_API_KEY", "unrelated-supplier-key"],
    ]);
    vi.stubGlobal("Deno", { env: { get: (name: string) => env.get(name) } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "{\"translatedText\":\"中環\"}" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(translateLocationToTraditionalChinese("Central", "district"))
      .resolves.toBe("中環");
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: "Bearer correct-xai-key",
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe(DEFAULT_ADDRESS_TRANSLATION_MODEL);
    expect(body.model).not.toBe("grok-4.6");
    expect(body.reasoning_effort).toBe("none");
  });
});
