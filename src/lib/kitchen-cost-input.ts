import { supabase } from "@/lib/supabase";

export const KITCHEN_COST_WEEK_COUNT = 6;

export type KitchenCostChannel = {
  id: string;
  legacyId: string;
  name: string;
  shortName: string | null;
  sortOrder: number;
};

export type KitchenCostType = {
  id: string;
  legacyId: string;
  name: string;
};

export type KitchenCostWeek = {
  start: string;
  end: string;
};

export type KitchenCostCell = {
  sales: number;
  costs: Record<string, number>;
};

export type KitchenCostReport = {
  channels: KitchenCostChannel[];
  costTypes: KitchenCostType[];
  weeks: KitchenCostWeek[];
  cells: Record<string, KitchenCostCell>;
};

export type KitchenAdvertisingCostRecord = {
  id: string;
  channelId: string | null;
  costTypeId: string | null;
  amount: number;
  rangeStart: string | null;
  rangeEnd: string | null;
  remarks: string;
};

export type KitchenAdvertisingCostPage = {
  items: KitchenAdvertisingCostRecord[];
  total: number;
};

type ChannelRecord = {
  id: string;
  legacy_id: string;
  name: string;
  short_name: string | null;
  sort_order: number | null;
};

type CostTypeRecord = {
  id: string;
  legacy_id: string;
  name: string;
};

type OrderRecord = {
  channel_id: string | null;
  bubble_created_at: string | null;
  grand_total: number | string | null;
};

type AdvertisingCostRecord = {
  id?: string;
  channel_id: string | null;
  cost_type_id: string | null;
  amount: number | string | null;
  range_start: string | null;
  range_end?: string | null;
  remarks?: string | null;
};

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dateFromKey(value: string) {
  if (!DATE_KEY_PATTERN.test(value)) throw new Error("Invalid date key");
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(dateKey: string, days: number) {
  const date = dateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

export function mondayForDate(dateKey: string) {
  const date = dateFromKey(dateKey);
  const day = date.getUTCDay();
  return addDays(dateKey, day === 0 ? -6 : 1 - day);
}

export function isMonday(dateKey: string) {
  return DATE_KEY_PATTERN.test(dateKey) && dateFromKey(dateKey).getUTCDay() === 1;
}

export function previousCompleteWeekStart(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hongKongDate = `${value("year")}-${value("month")}-${value("day")}`;
  return addDays(mondayForDate(hongKongDate), -7);
}

export function buildKitchenCostWeeks(newestWeekStart: string) {
  if (!isMonday(newestWeekStart)) throw new Error("Week must start on Monday");
  return Array.from({ length: KITCHEN_COST_WEEK_COUNT }, (_, index) => {
    const start = addDays(newestWeekStart, index * -7);
    return { start, end: addDays(start, 6) };
  });
}

export function formatWeekRange(week: KitchenCostWeek, locale = "zh-HK") {
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  return `${formatter.format(dateFromKey(week.start))} ～ ${formatter.format(dateFromKey(week.end))}`;
}

export function pastWeekOptions(count = 104, now = new Date()) {
  const newest = previousCompleteWeekStart(now);
  return Array.from({ length: count }, (_, index) => {
    const start = addDays(newest, index * -7);
    return { start, end: addDays(start, 6) };
  });
}

function weekIndexForTimestamp(timestamp: string | null, weeks: KitchenCostWeek[]) {
  const dateKey = hongKongDateKey(timestamp);
  if (!dateKey) return -1;
  return weeks.findIndex((week) => dateKey >= week.start && dateKey <= week.end);
}

export function hongKongDateKey(timestamp: string | null) {
  if (!timestamp) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function cellKey(channelId: string, weekStart: string) {
  return `${channelId}:${weekStart}`;
}

function asAmount(value: number | string | null) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export async function fetchLatestKitchenAdvertisingCostWeekStart() {
  const { data, error } = await supabase
    .from("advertising_costs")
    .select("range_start")
    .not("range_start", "is", null)
    .order("range_start", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  const latestDate = hongKongDateKey(
    ((data?.[0] as { range_start?: string | null } | undefined)?.range_start ?? null),
  );
  return latestDate ? mondayForDate(latestDate) : null;
}

export async function fetchKitchenCostReport(
  newestWeekStart: string,
): Promise<KitchenCostReport> {
  const weeks = buildKitchenCostWeeks(newestWeekStart);
  const oldestStart = weeks.at(-1)?.start ?? newestWeekStart;
  const upperBound = addDays(newestWeekStart, 7);

  const [channelsResult, typesResult, ordersResult, costsResult] = await Promise.all([
    supabase
      .from("channels")
      .select("id,legacy_id,name,short_name,sort_order")
      .eq("is_active", true)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("cost_types")
      .select("id,legacy_id,name")
      .eq("is_active", true)
      .eq("is_advertising", true)
      .order("name", { ascending: true }),
    supabase
      .from("orders")
      .select("channel_id,bubble_created_at,grand_total")
      .eq("document_type", "order")
      .is("archived_at", null)
      // Bubble 的 Ads Report 以订单 Created Date 归周，而不是送货日期。
      .gte("bubble_created_at", `${oldestStart}T00:00:00+08:00`)
      .lt("bubble_created_at", `${upperBound}T00:00:00+08:00`),
    supabase
      .from("advertising_costs")
      .select("channel_id,cost_type_id,amount,range_start")
      .gte("range_start", `${oldestStart}T00:00:00+08:00`)
      .lt("range_start", `${upperBound}T00:00:00+08:00`),
  ]);

  const firstError =
    channelsResult.error ??
    typesResult.error ??
    ordersResult.error ??
    costsResult.error;
  if (firstError) throw new Error(firstError.message);

  const channels = ((channelsResult.data ?? []) as ChannelRecord[]).map((row) => ({
    id: row.id,
    legacyId: row.legacy_id,
    name: row.name,
    shortName: row.short_name,
    sortOrder: row.sort_order ?? 999,
  }));
  const costTypeOrder = new Map([
    ["google", 0],
    ["facebook", 1],
    ["marketing", 2],
  ]);
  const costTypes = ((typesResult.data ?? []) as CostTypeRecord[])
    .map((row) => ({
      id: row.id,
      legacyId: row.legacy_id,
      name: row.name,
    }))
    .sort((left, right) => {
      const leftOrder = costTypeOrder.get(left.name.toLowerCase()) ?? 99;
      const rightOrder = costTypeOrder.get(right.name.toLowerCase()) ?? 99;
      return leftOrder - rightOrder || left.name.localeCompare(right.name);
    });
  const channelIds = new Set(channels.map((channel) => channel.id));
  const costTypeIds = new Set(costTypes.map((type) => type.id));
  const cells: Record<string, KitchenCostCell> = {};

  const getCell = (channelId: string, weekStart: string) => {
    const key = cellKey(channelId, weekStart);
    cells[key] ??= { sales: 0, costs: {} };
    return cells[key];
  };

  for (const order of (ordersResult.data ?? []) as OrderRecord[]) {
    if (!order.channel_id || !channelIds.has(order.channel_id)) continue;
    const weekIndex = weekIndexForTimestamp(order.bubble_created_at, weeks);
    if (weekIndex < 0) continue;
    getCell(order.channel_id, weeks[weekIndex].start).sales += asAmount(order.grand_total);
  }

  for (const cost of (costsResult.data ?? []) as AdvertisingCostRecord[]) {
    if (
      !cost.channel_id ||
      !cost.cost_type_id ||
      !channelIds.has(cost.channel_id) ||
      !costTypeIds.has(cost.cost_type_id)
    ) continue;
    const weekIndex = weekIndexForTimestamp(cost.range_start, weeks);
    if (weekIndex < 0) continue;
    const cell = getCell(cost.channel_id, weeks[weekIndex].start);
    cell.costs[cost.cost_type_id] =
      (cell.costs[cost.cost_type_id] ?? 0) + asAmount(cost.amount);
  }

  return { channels, costTypes, weeks, cells };
}

export function getKitchenCostCell(
  report: KitchenCostReport,
  channelId: string,
  weekStart: string,
) {
  return report.cells[cellKey(channelId, weekStart)] ?? { sales: 0, costs: {} };
}

export async function createKitchenAdvertisingCost(input: {
  channel: KitchenCostChannel;
  costType: KitchenCostType;
  weekStart: string;
  amount: number;
  remarks: string;
}) {
  if (!isMonday(input.weekStart)) throw new Error("日期必須為星期一");
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new Error("請輸入有效金額");
  }
  const now = new Date().toISOString();
  const weekEnd = addDays(input.weekStart, 6);
  const { error } = await supabase.from("advertising_costs").insert({
    legacy_id: crypto.randomUUID(),
    cost_type_id: input.costType.id,
    cost_type_legacy_id: input.costType.legacyId,
    channel_id: input.channel.id,
    channel_legacy_id: input.channel.legacyId,
    amount: input.amount,
    range_start: `${input.weekStart}T00:00:00+08:00`,
    range_end: `${weekEnd}T23:59:59.999+08:00`,
    sorting_key: Math.floor(Date.now() / 1000),
    remarks: input.remarks.trim() || null,
    bubble_created_at: now,
    bubble_modified_at: now,
  });
  if (error) throw new Error(error.message);
}

export async function fetchKitchenAdvertisingCosts(input: {
  page: number;
  pageSize?: number;
}): Promise<KitchenAdvertisingCostPage> {
  const pageSize = input.pageSize ?? 15;
  const from = Math.max(0, (input.page - 1) * pageSize);
  const to = from + pageSize - 1;
  const { data, count, error } = await supabase
    .from("advertising_costs")
    .select(
      "id,channel_id,cost_type_id,amount,range_start,range_end,remarks",
      { count: "exact" },
    )
    .order("range_start", { ascending: false, nullsFirst: false })
    .order("sorting_key", { ascending: false, nullsFirst: false })
    .range(from, to);
  if (error) throw new Error(error.message);
  return {
    items: ((data ?? []) as AdvertisingCostRecord[]).map((row) => ({
      id: row.id ?? "",
      channelId: row.channel_id,
      costTypeId: row.cost_type_id,
      amount: asAmount(row.amount),
      rangeStart: row.range_start,
      rangeEnd: row.range_end ?? null,
      remarks: row.remarks ?? "",
    })),
    total: count ?? 0,
  };
}

export async function updateKitchenAdvertisingCosts(
  changes: Array<{ id: string; amount: number; remarks: string }>,
) {
  const modifiedAt = new Date().toISOString();
  await Promise.all(
    changes.map(async (change) => {
      if (!Number.isFinite(change.amount) || change.amount < 0) {
        throw new Error("請輸入有效金額");
      }
      const { error } = await supabase
        .from("advertising_costs")
        .update({
          amount: change.amount,
          remarks: change.remarks.trim() || null,
          bubble_modified_at: modifiedAt,
        })
        .eq("id", change.id);
      if (error) throw new Error(error.message);
    }),
  );
}

export async function deleteKitchenAdvertisingCost(id: string) {
  const { error } = await supabase
    .from("advertising_costs")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
