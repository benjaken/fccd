export const DEFAULT_BUBBLE_BASE_URL =
  "https://cs.foodchannels-catering.com/api/1.1/obj";

type BubbleListResponse = {
  response?: {
    cursor?: number;
    results?: unknown[];
    count?: number;
    remaining?: number;
  };
  message?: string;
};

export type BubbleObjectSummary = {
  count: number;
  requestUrl: string;
};

export function buildBubbleObjectUrl(baseUrl: string, objectType: string) {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  const url = new URL(
    `${normalizedBaseUrl}/${encodeURIComponent(objectType)}`,
  );
  url.searchParams.set("limit", "1");
  return url;
}

export async function fetchBubbleObjectSummary(
  baseUrl: string,
  objectType: string,
  apiToken: string,
  signal?: AbortSignal,
): Promise<BubbleObjectSummary> {
  const url = buildBubbleObjectUrl(baseUrl, objectType);
  const response = await fetch(url, {
    headers: apiToken.trim()
      ? { Authorization: `Bearer ${apiToken.trim()}` }
      : undefined,
    signal,
  });

  const payload = (await response.json().catch(() => null)) as
    | BubbleListResponse
    | null;

  if (!response.ok) {
    throw new Error(
      payload?.message || `Bubble API returned HTTP ${response.status}.`,
    );
  }

  if (!payload?.response || !Array.isArray(payload.response.results)) {
    throw new Error("Bubble API returned an unexpected response.");
  }

  const cursor = payload.response.cursor ?? 0;
  const pageCount =
    payload.response.count ?? payload.response.results.length;
  const remaining = payload.response.remaining ?? 0;

  return {
    count: cursor + pageCount + remaining,
    requestUrl: url.toString(),
  };
}

