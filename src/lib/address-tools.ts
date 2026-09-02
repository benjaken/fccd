import { supabase } from "@/lib/supabase";

type AddressTranslationResponse = {
  translatedAddress?: unknown;
  translatedText?: unknown;
  error?: unknown;
};

export type LocationTranslationKind = "address" | "district";

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

  // Edge Functions reject an expired access token even when the UI still has
  // a cached session. Refresh first and pass the new token explicitly.
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.refreshSession();
  if (sessionError || !session?.access_token) {
    throw new Error("authentication_required", { cause: sessionError });
  }

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
  return translatedText.trim();
}

export function translateAddressToTraditionalChinese(address: string) {
  return translateLocationToTraditionalChinese(address, "address");
}

export function translateDistrictToTraditionalChinese(district: string) {
  return translateLocationToTraditionalChinese(district, "district");
}
