import { supabase } from "@/lib/supabase";
import { portalRpc } from "@/lib/customer-portal-rpc";

export type ShopifyVoucher = {
  id: string;
  name: string;
  amount: number;
  status: "queued" | "issuing" | "issued" | "failed";
  ends_at: string;
  code: string | null;
  shop_domain: string;
};

/** Ask the bridge to issue this account's queued vouchers or sync linked addresses. Local saves stay valid if Shopify is unavailable. */
export function requestShopifyCustomerSync(action: "issue_mine" | "sync_mine") {
  void supabase.auth.getSession().then(({ data }) => {
    if (!data.session?.access_token) return;
    return supabase.functions.invoke("shopify-customer-bridge", { body: { action } });
  }).catch(() => undefined);
}

export async function listPersonalShopifyVouchers() {
  const { data, error } = await supabase.rpc("customer_personal_shopify_vouchers");
  if (error) throw error;
  return (data ?? []) as ShopifyVoucher[];
}

export async function listPortalShopifyVouchers(organizationId?: string) {
  return (await portalRpc<ShopifyVoucher[]>("customer_portal_shopify_vouchers", undefined, organizationId)) ?? [];
}

export async function linkShopifyCustomer(input: { ownerType: "user" | "organization"; ownerId: string; storeId: string; customerId: string }) {
  const { data, error } = await supabase.rpc("customer_portal_ops_link_shopify_customer", {
    p_owner_type: input.ownerType, p_owner_id: input.ownerId, p_store_id: input.storeId, p_customer_id: input.customerId,
  });
  if (error) throw error;
  return data as string;
}
