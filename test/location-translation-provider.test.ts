import { afterEach, describe, expect, it, vi } from "vitest";

import { translateLocationToTraditionalChinese } from "../supabase/functions/_shared/location-translation";

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
      reasoning_effort: "low",
      temperature: 0,
    });
    expect(retryBody).toEqual({
      model: "test-model",
      max_tokens: 600,
      messages: firstBody.messages,
    });
  });
});
