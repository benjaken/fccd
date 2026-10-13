import { supabase } from "@/lib/supabase";

export type RewardRuleVersion = {
  id: string;
  hkd_per_point: number;
  effective_at: string;
  created_at: string;
  created_by: string | null;
  is_active: boolean;
};

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export const listRewardRules = () =>
  rpc<RewardRuleVersion[]>("customer_portal_ops_list_reward_rules");

export const createRewardRule = (hkdPerPoint: number, effectiveAt: string) =>
  rpc<string>("customer_portal_ops_create_reward_rule", {
    p_hkd_per_point: hkdPerPoint,
    p_effective_at: effectiveAt,
  });
