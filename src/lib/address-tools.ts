import { supabase } from "@/lib/supabase";

type AddressTranslationResponse = {
  translatedAddress?: unknown;
  translatedText?: unknown;
  error?: unknown;
};

export type LocationTranslationKind = "address" | "district";

const LOCATION_TRANSLATION_CACHE_LIMIT = 100;
const locationTranslationCache = new Map<string, string>();
const locationTranslationRequests = new Map<string, Promise<string>>();

function translationCacheKey(text: string, kind: LocationTranslationKind) {
  return `${kind}:${text.trim().replaceAll(/\s+/g, " ").toLocaleLowerCase("en-HK")}`;
}

function cacheTranslation(key: string, translatedText: string) {
  locationTranslationCache.delete(key);
  locationTranslationCache.set(key, translatedText);
  if (locationTranslationCache.size <= LOCATION_TRANSLATION_CACHE_LIMIT) return;
  const oldestKey = locationTranslationCache.keys().next().value;
  if (typeof oldestKey === "string") locationTranslationCache.delete(oldestKey);
}

export function googleMapsSearchUrl(address: string) {
  const query = address.trim();
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : "";
}

export function googleMapsEmbedUrl(address: string) {
  const query = address.trim();
  return query
    ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`
    : "";
}

export async function translateLocationToTraditionalChinese(
  text: string,
  kind: LocationTranslationKind,
) {
  const sourceText = text.trim();
  if (!sourceText) throw new Error("location_required");

  const cacheKey = translationCacheKey(sourceText, kind);
  const cached = locationTranslationCache.get(cacheKey);
  if (cached) return cached;
  const pending = locationTranslationRequests.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    // Supabase already refreshes the persisted session in the background. A
    // forced refresh here can fail independently (for example while another
    // request owns the refresh lock) and prevent the Edge Function invocation
    // altogether, so use the current SDK-managed session just like report AI.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("authentication_required");

    const { data, error } = await supabase.functions.invoke<AddressTranslationResponse>(
      "translate-address",
      {
        body: { text: sourceText, kind },
        headers: { Authorization: `Bearer ${session.access_token}` },
      },
    );
    if (error) {
      const response = (error as { context?: Response }).context;
      const details = response ? await response.clone().text().catch(() => "") : "";
      throw new Error(details || error.message, { cause: error });
    }

    const translatedText = data?.translatedText ?? data?.translatedAddress;
    if (typeof translatedText !== "string" || !translatedText.trim()) {
      throw new Error(typeof data?.error === "string" ? data.error : "address_translation_failed");
    }
    const result = translatedText.trim();
    cacheTranslation(cacheKey, result);
    return result;
  })();
  locationTranslationRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (locationTranslationRequests.get(cacheKey) === request) {
      locationTranslationRequests.delete(cacheKey);
    }
  }
}

export function translateAddressToTraditionalChinese(address: string) {
  return translateLocationToTraditionalChinese(address, "address");
}

export function translateDistrictToTraditionalChinese(district: string) {
  return translateLocationToTraditionalChinese(district, "district");
}
