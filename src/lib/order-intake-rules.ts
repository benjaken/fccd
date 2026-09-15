import { supabase } from "@/lib/supabase";

export type OrderIntakeRuleChannel = {
  id: string;
  channelId: string;
  channelName: string;
  brandTerms: string[];
  productTerms: string[];
};

export type OrderIntakeRuleSetting = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
  handling: "allow_only" | "manual_review";
  addonHandling: "allow" | "manual_review";
  customerMessage: string | null;
  internalNote: string | null;
  isActive: boolean;
  channels: OrderIntakeRuleChannel[];
};

export type OrderIntakeRuleInput = {
  name: string;
  startsOn: string;
  endsOn: string;
  startTime?: string;
  endTime?: string;
  handling: "allow_only" | "manual_review";
  addonHandling: "allow" | "manual_review";
  customerMessage: string;
  internalNote: string;
  channels: Array<{
    channelId: string;
    brandTerms: string[];
    productTerms: string[];
  }>;
};

function hongKongDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function sortOrderIntakeRulesByProximity(
  rows: OrderIntakeRuleSetting[],
  today = hongKongDate(),
) {
  return [...rows].sort((left, right) => {
    const leftUpcoming = left.endsOn >= today;
    const rightUpcoming = right.endsOn >= today;
    if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;
    if (leftUpcoming) {
      return left.startsOn.localeCompare(right.startsOn) || left.endsOn.localeCompare(right.endsOn);
    }
    return right.endsOn.localeCompare(left.endsOn) || right.startsOn.localeCompare(left.startsOn);
  });
}

type ChannelRow = {
  id: string;
  channel_id: string;
  product_terms: string[] | null;
  brand_terms: string[] | null;
  channels: { name?: string | null } | Array<{ name?: string | null }> | null;
};

export async function fetchOrderIntakeRules(): Promise<OrderIntakeRuleSetting[]> {
  const { data, error } = await supabase.from("order_intake_rules")
    .select("id,name,starts_on,ends_on,start_time,end_time,handling,addon_handling,customer_message,internal_note,is_active,order_intake_rule_channels(id,channel_id,brand_terms,product_terms,channels(name))")
    .is("archived_at", null).order("starts_on");
  if (error) throw error;
  return sortOrderIntakeRulesByProximity((data ?? []).map((row) => ({
    id: row.id, name: row.name, startsOn: row.starts_on, endsOn: row.ends_on,
    startTime: row.start_time?.slice(0, 5) ?? null, endTime: row.end_time?.slice(0, 5) ?? null,
    handling: row.handling, addonHandling: row.addon_handling,
    customerMessage: row.customer_message, internalNote: row.internal_note, isActive: row.is_active,
    channels: ((row.order_intake_rule_channels ?? []) as ChannelRow[]).map((item) => ({
      id: item.id, channelId: item.channel_id,
      channelName: (Array.isArray(item.channels) ? item.channels[0]?.name : item.channels?.name) || "—",
      brandTerms: item.brand_terms ?? [], productTerms: item.product_terms ?? [],
    })),
  })) as OrderIntakeRuleSetting[]);
}

export async function createOrderIntakeRule(input: OrderIntakeRuleInput) {
  const { data: rule, error } = await supabase.from("order_intake_rules").insert({
    name: input.name.trim(), starts_on: input.startsOn, ends_on: input.endsOn,
    start_time: input.startTime || null, end_time: input.endTime || null,
    handling: input.handling, addon_handling: input.addonHandling,
    customer_message: input.customerMessage.trim() || null, internal_note: input.internalNote.trim() || null,
  }).select("id").single();
  if (error) throw error;
  if (input.channels.length) {
    const { error: channelError } = await supabase.from("order_intake_rule_channels").insert(
      input.channels.map((channel) => ({ rule_id: rule.id, channel_id: channel.channelId,
        brand_terms: channel.brandTerms, product_terms: channel.productTerms,
        recommendation_url: null })),
    );
    if (channelError) {
      await supabase.from("order_intake_rules").update({ archived_at: new Date().toISOString() }).eq("id", rule.id);
      throw channelError;
    }
  }
}

export async function updateOrderIntakeRule(id: string, input: OrderIntakeRuleInput) {
  const { error } = await supabase.rpc("update_order_intake_rule", {
    p_rule_id: id,
    p_name: input.name.trim(),
    p_starts_on: input.startsOn,
    p_ends_on: input.endsOn,
    p_start_time: input.startTime || null,
    p_end_time: input.endTime || null,
    p_handling: input.handling,
    p_addon_handling: input.addonHandling,
    p_customer_message: input.customerMessage.trim() || null,
    p_internal_note: input.internalNote.trim() || null,
    p_channels: input.channels,
  });
  if (error) throw error;
}

export async function archiveOrderIntakeRule(id: string) {
  const { error } = await supabase.from("order_intake_rules")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
