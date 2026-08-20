import { supabase } from "@/lib/supabase";

export type KitchenMonthlyCostRow = {
  id: string;
  monthAt: string | null;
  amount: number;
  remarks: string;
  costTypeName: string;
  channelNames: string[];
};

export type KitchenMonthlyCostPage = {
  items: KitchenMonthlyCostRow[];
  total: number;
};

export type KitchenMonthlyCostType = {
  id: string;
  legacyId: string;
  name: string;
};

export type KitchenMonthlyCostChannel = {
  id: string;
  legacyId: string;
  name: string;
  sortOrder: number;
};

export type KitchenFestival = {
  id: string;
  legacyId: string;
  name: string;
};

export type KitchenFestivalCostRow = KitchenMonthlyCostRow & {
  festivalName: string;
  rangeStart: string | null;
  rangeEnd: string | null;
};

type MonthlyCostRpcRow = {
  id: string;
  month_at: string | null;
  amount: number | string | null;
  remarks: string | null;
  cost_type_name: string;
  channel_names: string[] | null;
  total_count: number | string;
};

type FestivalCostRpcRow = MonthlyCostRpcRow & {
  range_start: string | null;
  range_end: string | null;
  festival_name: string;
};

const monthlyCostTypeOrder = [
  "Google",
  "Facebook",
  "Delivery charge",
  "Food cost",
  "Packing",
  "Rent",
  "Wages",
  "Miscellaneous",
  "Water",
  "Electricity",
  "Shopify",
  "Marketing",
];

export async function fetchKitchenMonthlyCostTypes() {
  const { data, error } = await supabase
    .from("cost_types")
    .select("id,legacy_id,name")
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  const order = new Map(monthlyCostTypeOrder.map((name, index) => [name.toLowerCase(), index]));
  return ((data ?? []) as Array<{ id: string; legacy_id: string; name: string }>)
    .map((row) => ({ id: row.id, legacyId: row.legacy_id, name: row.name }))
    .sort((left, right) =>
      (order.get(left.name.toLowerCase()) ?? 999) -
        (order.get(right.name.toLowerCase()) ?? 999) ||
      left.name.localeCompare(right.name),
    );
}

export async function fetchKitchenMonthlyCostChannels() {
  const { data, error } = await supabase
    .from("channels")
    .select("id,legacy_id,name,sort_order")
    .eq("is_active", true)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string; legacy_id: string; name: string; sort_order: number | null }>).map(
    (row) => ({
      id: row.id,
      legacyId: row.legacy_id,
      name: row.name,
      sortOrder: row.sort_order ?? 999,
    }),
  );
}

export async function fetchKitchenFestivals() {
  const { data, error } = await supabase
    .from("festivals")
    .select("id,legacy_id,name")
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  const preferred = ["Xmas + 冬至", "中秋節", "復活節", "母親節", "父親節", "農曆新年"];
  const order = new Map(preferred.map((name, index) => [name, index]));
  return ((data ?? []) as Array<{ id: string; legacy_id: string; name: string }>)
    .map((row) => ({ id: row.id, legacyId: row.legacy_id, name: row.name }))
    .sort((left, right) =>
      (order.get(left.name) ?? 999) - (order.get(right.name) ?? 999) ||
      left.name.localeCompare(right.name),
    );
}

export async function createKitchenMonthlyNonFestivalCost(input: {
  costType: KitchenMonthlyCostType;
  month: string;
  amount: number;
  remarks: string;
}) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("monthly_costs").insert({
    legacy_id: `web-monthly-cost-${crypto.randomUUID()}`,
    cost_type_id: input.costType.id,
    cost_type_legacy_id: input.costType.legacyId,
    month_at: `${input.month}-01T00:00:00+08:00`,
    non_peak_amount: input.amount,
    season: "Non-peak",
    remarks: input.remarks.trim() || null,
    bubble_created_at: now,
    bubble_modified_at: now,
  });
  if (error) throw new Error(error.message);
}

export async function fetchKitchenMonthlyFestivalCosts({
  page,
  pageSize,
}: {
  page: number;
  pageSize: number;
}): Promise<{ items: KitchenFestivalCostRow[]; total: number }> {
  const { data, error } = await supabase.rpc("get_kitchen_monthly_festival_costs", {
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as FestivalCostRpcRow[];
  const items = rows.map((row) => ({
      id: row.id,
      monthAt: row.month_at,
      amount: Number(row.amount ?? 0),
      remarks: row.remarks ?? "",
      costTypeName: row.cost_type_name,
      channelNames: row.channel_names ?? [],
      festivalName: row.festival_name,
      rangeStart: row.range_start,
      rangeEnd: row.range_end,
    }));
  return { items, total: Number(rows[0]?.total_count ?? 0) };
}

export async function createKitchenMonthlyFestivalCost(input: {
  costType: KitchenMonthlyCostType;
  channels: KitchenMonthlyCostChannel[];
  festival: KitchenFestival;
  rangeStart: string;
  rangeEnd: string;
  amount: number;
  remarks: string;
}) {
  const now = new Date().toISOString();
  const legacyId = `web-festival-cost-${crypto.randomUUID()}`;
  const primaryChannel = input.channels.length === 1 ? input.channels[0] : null;
  const { data, error } = await supabase
    .from("monthly_costs")
    .insert({
      legacy_id: legacyId,
      cost_type_id: input.costType.id,
      cost_type_legacy_id: input.costType.legacyId,
      primary_channel_id: primaryChannel?.id ?? null,
      primary_channel_legacy_id: primaryChannel?.legacyId ?? null,
      festival_id: input.festival.id,
      festival_legacy_id: input.festival.legacyId,
      month_at: `${input.rangeStart.slice(0, 7)}-01T00:00:00+08:00`,
      festival_amount: input.amount,
      festival_range_start: `${input.rangeStart}T00:00:00+08:00`,
      festival_range_end: `${input.rangeEnd}T23:59:59+08:00`,
      season: "Peak",
      remarks: input.remarks.trim() || null,
      bubble_created_at: now,
      bubble_modified_at: now,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const links = input.channels.map((channel) => ({
    monthly_cost_id: data.id,
    monthly_cost_legacy_id: legacyId,
    channel_id: channel.id,
    channel_legacy_id: channel.legacyId,
  }));
  if (links.length === 0) return;
  const linked = await supabase.from("monthly_cost_channels").insert(links);
  if (linked.error) {
    await supabase.from("monthly_costs").delete().eq("id", data.id);
    throw new Error(linked.error.message);
  }
}

export async function updateKitchenMonthlyFestivalCosts(
  changes: Array<{ id: string; amount: number; remarks: string }>,
) {
  for (const change of changes) {
    const { error } = await supabase
      .from("monthly_costs")
      .update({
        festival_amount: change.amount,
        remarks: change.remarks.trim() || null,
        bubble_modified_at: new Date().toISOString(),
      })
      .eq("id", change.id);
    if (error) throw new Error(error.message);
  }
}

export async function fetchKitchenMonthlyNonFestivalCosts({
  page,
  pageSize,
}: {
  page: number;
  pageSize: number;
}): Promise<KitchenMonthlyCostPage> {
  const { data, error } = await supabase.rpc("get_kitchen_monthly_non_festival_costs", {
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as MonthlyCostRpcRow[];
  const items = rows.map((row) => ({
      id: row.id,
      monthAt: row.month_at,
      amount: Number(row.amount ?? 0),
      remarks: row.remarks ?? "",
      costTypeName: row.cost_type_name,
      channelNames: row.channel_names ?? [],
    }));
  return { items, total: Number(rows[0]?.total_count ?? 0) };
}

export async function updateKitchenMonthlyNonFestivalCosts(
  changes: Array<{ id: string; amount: number; remarks: string }>,
) {
  for (const change of changes) {
    const { error } = await supabase
      .from("monthly_costs")
      .update({
        non_peak_amount: change.amount,
        remarks: change.remarks.trim() || null,
        bubble_modified_at: new Date().toISOString(),
      })
      .eq("id", change.id);
    if (error) throw new Error(error.message);
  }
}

export async function deleteKitchenMonthlyCost(id: string) {
  const childDelete = await supabase
    .from("monthly_cost_channels")
    .delete()
    .eq("monthly_cost_id", id);
  if (childDelete.error) throw new Error(childDelete.error.message);

  const costDelete = await supabase.from("monthly_costs").delete().eq("id", id);
  if (costDelete.error) throw new Error(costDelete.error.message);
}
