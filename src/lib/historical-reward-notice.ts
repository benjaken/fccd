import { supabase } from "@/lib/supabase";

export type HistoricalRewardNotice = { batchKey: string; claimedAt: string; points: number; expiresAt: string };

export async function fetchHistoricalRewardNotice(): Promise<HistoricalRewardNotice | null> {
  const { data, error } = await supabase.rpc("customer_personal_historical_reward_notice");
  if (error) throw error;
  if (data == null) return null;
  const notice = data as HistoricalRewardNotice;
  if (!notice.batchKey || !Number.isSafeInteger(notice.points) || notice.points <= 0
    || !Number.isFinite(Date.parse(notice.claimedAt)) || !Number.isFinite(Date.parse(notice.expiresAt)))
    throw new Error("invalid_historical_reward_notice");
  return notice;
}

export async function acknowledgeHistoricalRewardNotice(notice: HistoricalRewardNotice) {
  const { error } = await supabase.rpc("customer_personal_acknowledge_reward_notice", {
    p_batch_key: notice.batchKey, p_claimed_at: notice.claimedAt,
  });
  if (error) throw error;
}
