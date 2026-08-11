import { supabase } from "@/lib/supabase";

export const DEFAULT_BUBBLE_BASE_URL =
  "https://cs.foodchannels-catering.com/version-test/api/1.1/obj";

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
): Promise<BubbleObjectSummary> {
  const { data, error } = await supabase.functions.invoke("bubble-scan", {
    body: { baseUrl, objectType },
  });

  if (error) {
    throw new Error(error.message || "Bubble scan function failed.");
  }

  if (
    !data ||
    typeof data.count !== "number" ||
    typeof data.requestUrl !== "string"
  ) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Bubble scan function returned an unexpected response.",
    );
  }

  return {
    count: data.count,
    requestUrl: data.requestUrl,
  };
}

