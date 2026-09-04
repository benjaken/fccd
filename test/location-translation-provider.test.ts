import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_ADDRESS_TRANSLATION_MODEL,
  hasUntranslatedEnglish,
  translateLocationToTraditionalChinese,
} from "../supabase/functions/_shared/location-translation";

function stubTranslationEnv(entries: Array<[string, string]>) {
  const env = new Map(entries);
  vi.stubGlobal("Deno", { env: { get: (name: string) => env.get(name) } });
}

describe("location translation completeness", () => {
  it("treats a Chinese-prefixed English address as incomplete", () => {
    expect(hasUntranslatedEnglish(
      "紅磡Unit1010B, 10/F, Heng Ngai Jewelry Centre, No.4 Hok Yuen Street East, Hunghom, Kowloon, Hong Kong",
    )).toBe(true);
    expect(hasUntranslatedEnglish("香港九龍紅磡鶴園東街4號恆藝珠寶中心10樓1010B室")).toBe(false);
    expect(hasUntranslatedEnglish("中環皇后大道中12號")).toBe(false);
    expect(hasUntranslatedEnglish("Block 2")).toBe(false);
  });
});

describe("location translation provider compatibility", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses grok-4.3 with reasoning_effort none by default", async () => {
    stubTranslationEnv([
      ["ADDRESS_TRANSLATION_AI_ENABLED", "true"],
      ["ADDRESS_TRANSLATION_AI_ENDPOINT", "https://example.test/chat/completions"],
      ["ADDRESS_TRANSLATION_AI_API_KEY", "test-key"],
    ]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "{\"translatedText\":\"中環皇后大道中12號\"}" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(translateLocationToTraditionalChinese("12 Queen's Road Central", "address"))
      .resolves.toBe("中環皇后大道中12號");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe("grok-4.3");
    expect(body.model).toBe(DEFAULT_ADDRESS_TRANSLATION_MODEL);
    expect(body).toMatchObject({
      response_format: { type: "json_object" },
      reasoning_effort: "none",
      temperature: 0,
      stream: false,
    });
    expect(String(body.messages[0].content)).toContain("恆藝珠寶中心");
  });

  it("retries a grok-4.3 400 without dropping reasoning_effort none", async () => {
    stubTranslationEnv([
      ["ADDRESS_TRANSLATION_AI_ENABLED", "true"],
      ["ADDRESS_TRANSLATION_AI_ENDPOINT", "https://example.test/chat/completions"],
      ["ADDRESS_TRANSLATION_AI_API_KEY", "test-key"],
      ["ADDRESS_TRANSLATION_AI_MODEL", "grok-4.3"],
    ]);
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
      model: "grok-4.3",
      response_format: { type: "json_object" },
      reasoning_effort: "none",
      temperature: 0,
    });
    expect(retryBody).toEqual({
      model: "grok-4.3",
      max_tokens: 160,
      stream: false,
      reasoning_effort: "none",
      messages: firstBody.messages,
    });
  });

  it("retries an incomplete English remainder with grok-4.3", async () => {
    stubTranslationEnv([
      ["ADDRESS_TRANSLATION_AI_ENABLED", "true"],
      ["ADDRESS_TRANSLATION_AI_ENDPOINT", "https://example.test/chat/completions"],
      ["ADDRESS_TRANSLATION_AI_API_KEY", "test-key"],
      ["ADDRESS_TRANSLATION_AI_MODEL", "grok-4.20-non-reasoning"],
    ]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "{\"translatedText\":\"紅磡Unit1010B, 10/F, Heng Ngai Jewelry Centre, No.4 Hok Yuen Street East, Hunghom, Kowloon, Hong Kong\"}" } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "{\"translatedText\":\"香港九龍紅磡鶴園東街4號恆藝珠寶中心10樓1010B室\"}" } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(translateLocationToTraditionalChinese(
      "Unit1010B, 10/F, Heng Ngai Jewelry Centre, No.4 Hok Yuen Street East, Hunghom, Kowloon, Hong Kong",
      "address",
    )).resolves.toBe("香港九龍紅磡鶴園東街4號恆藝珠寶中心10樓1010B室");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).model).toBe("grok-4.20-non-reasoning");
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(retryBody.model).toBe("grok-4.3");
    expect(retryBody.reasoning_effort).toBe("none");
    expect(retryBody.messages[1].content).toContain("previousResultWasIncomplete");
  });

  it("ignores grok-4.6 even when ADDRESS_TRANSLATION_AI_MODEL is set", async () => {
    stubTranslationEnv([
      ["ADDRESS_TRANSLATION_AI_ENABLED", "true"],
      ["ADDRESS_TRANSLATION_AI_ENDPOINT", "https://api.x.ai/v1/chat/completions"],
      ["ADDRESS_TRANSLATION_AI_API_KEY", "test-key"],
      ["ADDRESS_TRANSLATION_AI_MODEL", "grok-4.6"],
      ["REPORT_AI_MODEL", "grok-4.6"],
    ]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "{\"translatedText\":\"中環\"}" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(translateLocationToTraditionalChinese("Central", "district"))
      .resolves.toBe("中環");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe(DEFAULT_ADDRESS_TRANSLATION_MODEL);
    expect(body.reasoning_effort).toBe("none");
    expect(body.service_tier).toBe("priority");
  });

  it("drops priority processing on the portable 400 compatibility retry", async () => {
    stubTranslationEnv([
      ["ADDRESS_TRANSLATION_AI_ENABLED", "true"],
      ["ADDRESS_TRANSLATION_AI_ENDPOINT", "https://api.x.ai/v1/chat/completions"],
      ["ADDRESS_TRANSLATION_AI_API_KEY", "test-key"],
    ]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unsupported parameter", { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "{\"translatedText\":\"中環\"}" } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(translateLocationToTraditionalChinese("Central", "district"))
      .resolves.toBe("中環");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).service_tier).toBe("priority");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).service_tier).toBeUndefined();
  });

  it("does not retry after an aborted first attempt", async () => {
    stubTranslationEnv([
      ["ADDRESS_TRANSLATION_AI_ENABLED", "true"],
      ["ADDRESS_TRANSLATION_AI_ENDPOINT", "https://example.test/chat/completions"],
      ["ADDRESS_TRANSLATION_AI_API_KEY", "test-key"],
    ]);
    const abort = Object.assign(new Error("The signal has been aborted"), { name: "AbortError" });
    const fetchMock = vi.fn().mockRejectedValueOnce(abort);
    vi.stubGlobal("fetch", fetchMock);

    await expect(translateLocationToTraditionalChinese("Central", "district"))
      .rejects.toThrow("location_translation_timeout");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
