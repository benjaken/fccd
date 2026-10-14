import { supabase } from "@/lib/supabase";
import { requestShopifyCustomerSync } from "@/lib/shopify-customer-bridge";
import { portalRpc } from "@/lib/customer-portal-rpc";

export type RewardCatalogItem = { id: string; name: string; kind: "gift" | "voucher"; points_cost: number; description: string; stock: number; voucher_amount_hkd?: number | null };
export type RewardCatalogOpsItem = RewardCatalogItem & { is_active: boolean; shopify_store_id?: string | null; voucher_valid_days?: number };
export type RewardRedemption = { id: string; name: string; kind: "gift" | "voucher"; points: number; status: "pending" | "fulfilled"; account: string; created_at: string; voucher_status?: string | null; voucher_last4?: string | null };

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export const listRewardCatalog = () => rpc<RewardCatalogItem[]>("customer_reward_catalog");
export async function redeemPersonalCatalog(requestId: string, catalogId: string) {
  const result = await rpc<{ id: string; balance: number }>("customer_personal_redeem_catalog", { p_request_id: requestId, p_catalog_id: catalogId });
  requestShopifyCustomerSync("issue_mine");
  return result;
}
export async function redeemOrganizationCatalog(requestId: string, catalogId: string, organizationId?: string) {
  const result = await portalRpc<{ id: string; balance: number }>("customer_portal_redeem_catalog", { p_request_id: requestId, p_catalog_id: catalogId }, organizationId);
  requestShopifyCustomerSync("issue_mine");
  return result;
}
export const listRewardCatalogOps = () => rpc<RewardCatalogOpsItem[]>("customer_portal_ops_list_reward_catalog");
export const listRewardRedemptions = () => rpc<RewardRedemption[]>("customer_portal_ops_list_reward_redemptions");
export const fetchRewardRedemptionPage = (page: number) =>
  rpc<{ rows: RewardRedemption[]; total: number; page: number }>("customer_portal_ops_redemption_page", { p_page: page });
export const upsertRewardCatalogItem = (input: { id?: string | null; name: string; kind: "gift" | "voucher"; points: number; description: string; stock: number; active: boolean; voucherAmount?: number | null; storeId?: string | null; validDays?: number }) =>
  rpc<string>("customer_portal_ops_upsert_reward_catalog", {
    p_id: input.id ?? null, p_name: input.name, p_kind: input.kind, p_points: input.points, p_description: input.description, p_stock: input.stock, p_active: input.active,
    p_voucher_amount: input.kind === "voucher" ? input.voucherAmount ?? null : null,
    p_store_id: input.kind === "voucher" ? input.storeId ?? null : null,
    p_valid_days: input.validDays ?? 365,
  });
export const fulfillRewardRedemption = (id: string) => rpc<void>("customer_portal_ops_fulfill_reward_redemption", { p_id: id });
