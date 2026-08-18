import { supabase } from "@/lib/supabase";

export type ShopifySyncStoreResult = {
  store: string | null;
  secretPrefix: string;
  ok: boolean;
  error?: string;
  fetched: number;
  inserted: number;
  linkedExisting: number;
  updatedShopify: number;
  unmatchedSkuLines: number;
  paymentsInserted: number;
  paymentsPending: number;
  issueCount: number;
};

export type ShopifySyncResult = {
  ok: boolean;
  dryRun: boolean;
  backfill: boolean;
  storeCount: number;
  fetched: number;
  inserted: number;
  linkedExisting: number;
  updatedShopify: number;
  unmatchedSkuLines: number;
  paymentsInserted: number;
  paymentsPending: number;
  issueCount: number;
  stores: ShopifySyncStoreResult[];
};

/**
 * Triggers a lightweight Shopify order refresh from the pending queue page.
 * The browser call authenticates with the logged-in user's JWT; the function
 * keeps the existing cron secret path for scheduled runs.
 */
export async function syncShopifyOrders(): Promise<ShopifySyncResult> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.access_token) throw new Error("missing_authorization");

  const { data, error } = await supabase.functions.invoke("shopify-order-sync", {
    body: { limit: 20 },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    // A full five-store refresh plus per-order transaction lookups can take
    // well over the default 60s client timeout; the function itself finishes
    // within the platform's 150s ceiling.
    timeout: 120_000,
  });
  if (error) {
    const context = (error as { context?: unknown }).context;
    const contextBody =
      context && typeof context === "object" && "json" in context
        ? await (context as Response).json().catch(() => null)
        : null;
    const relayError =
      contextBody && typeof contextBody === "object"
        ? (contextBody as { error?: string }).error
        : null;
    if (relayError) throw new Error(relayError);
    throw error;
  }
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(String((data as { error: string }).error));
  }
  return data as ShopifySyncResult;
}
