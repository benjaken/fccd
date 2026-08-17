import {
  averageMonthlyMeatPrices,
  computeMonthlyMeatUnitPrices,
} from "@/lib/monthly-meat-price";
import { supabase } from "@/lib/supabase";

export const SELLING_PRICE_COST_PAGE_SIZE = 15;

const HONG_KONG_TZ = "Asia/Hong_Kong";

export type SellingPriceRawMeatOption = {
  id: string;
  name: string;
  sortOrder: number | null;
};

export type SellingPriceCostRow = {
  id: string;
  movementAt: string | null;
  productName: string;
  rawMeatName: string;
  rawMeatWeightKg: number | null;
  inboundUnitPrice: number | null;
  seasoningCode: string | null;
  seasoningPerKg: number | null;
  seasoningCost: number | null;
  yieldKg: number | null;
  yieldPercent: number | null;
  totalCost: number | null;
  markupRate: number | null;
  yieldDifferencePerKg: number | null;
  variationRate: number | null;
  listPricePerKg: number | null;
};

type PreparedItemRow = {
  id: string;
  name: string;
  kg_per_package: number | string | null;
  raw_meat_items:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;
};

type MovementRow = {
  id: string;
  movement_at: string | null;
  inbound_packages: number | string | null;
  prepared_meat_item_id: string | null;
  bubble_created_at: string | null;
  created_at: string;
};

type SourceRow = {
  prepared_movement_id: string;
  raw_stock_movement_id: string | null;
  raw_meat_stock_movements:
    | {
        outbound_quantity_kg: number | string | null;
        applied_seasoning_code: number | string | null;
        applied_seasoning_per_kg: number | string | null;
        applied_markup_rate: number | string | null;
        applied_variation_rate: number | string | null;
      }
    | {
        outbound_quantity_kg: number | string | null;
        applied_seasoning_code: number | string | null;
        applied_seasoning_per_kg: number | string | null;
        applied_markup_rate: number | string | null;
        applied_variation_rate: number | string | null;
      }[]
    | null;
};

type RelationRow = {
  movement_id: string;
  inbound_movement_id: string;
};

type InboundPriceRow = {
  id: string;
  inbound_unit_price: number | string | null;
};

type RawMeatOptionRow = {
  id: string;
  name: string;
  sort_order: number | string | null;
};

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function includesIgnoreCase(haystack: string | null | undefined, needle: string) {
  if (!needle) return true;
  return (haystack ?? "")
    .toLocaleLowerCase("zh-HK")
    .includes(needle.toLocaleLowerCase("zh-HK"));
}

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isHongKongYearMonth(
  value: string | null | undefined,
): value is string {
  return Boolean(value && YEAR_MONTH_PATTERN.test(value));
}

/** YYYY-MM key for a timestamp in Asia/Hong_Kong. */
export function hongKongYearMonthKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HONG_KONG_TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) return "";
  return `${year}-${month}`;
}

export function formatSeasoningCode(
  value: number | string | null | undefined,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value).trim() || null;
  if (Number.isInteger(numeric)) return String(numeric);
  return String(numeric);
}

/** Display applied rate as (+5%) / (+15%). */
export function formatSignedPercent(rate: number) {
  const percent = Math.round(rate * 10000) / 100;
  const body = Number.isInteger(percent)
    ? String(percent)
    : percent.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  if (percent > 0) return `+${body}%`;
  if (percent < 0) return `${body}%`;
  return "0%";
}

export function computeSellingPriceCost(input: {
  rawMeatWeightKg: number | null;
  inboundUnitPrice: number | null;
  seasoningPerKg: number | null;
  yieldKg: number | null;
  markupRate: number | null;
  variationRate: number | null;
}) {
  const weight = input.rawMeatWeightKg;
  const price = input.inboundUnitPrice;
  const seasoningPerKg = input.seasoningPerKg ?? 0;
  const yieldKg = input.yieldKg;
  const markup = input.markupRate ?? 0;
  const variation = input.variationRate ?? 0;

  const seasoningCost = weight === null ? null : weight * seasoningPerKg;
  const yieldPercent =
    weight !== null && weight > 0 && yieldKg !== null ? yieldKg / weight : null;
  const totalCost =
    weight !== null && price !== null
      ? weight * price + (seasoningCost ?? 0)
      : null;
  const yieldDifferencePerKg =
    totalCost !== null && yieldKg !== null && yieldKg > 0
      ? (totalCost / yieldKg) * (1 + markup)
      : null;
  const listPricePerKg =
    yieldDifferencePerKg === null
      ? null
      : yieldDifferencePerKg * (1 + variation);

  return {
    seasoningCost,
    yieldPercent,
    totalCost,
    yieldDifferencePerKg,
    listPricePerKg,
  };
}

export function filterSellingPriceCostRows(
  rows: SellingPriceCostRow[],
  search = "",
  monthKey: string | null = null,
  formatDate: (value: string | null) => string = (value) => value ?? "",
  formatMonth: (value: string | null) => string = (value) => value ?? "",
) {
  const query = search.trim();
  return rows.filter((row) => {
    if (monthKey) {
      if (!row.movementAt || hongKongYearMonthKey(row.movementAt) !== monthKey) {
        return false;
      }
    }
    if (!query) return true;
    return (
      includesIgnoreCase(row.productName, query) ||
      includesIgnoreCase(row.rawMeatName, query) ||
      includesIgnoreCase(row.seasoningCode, query) ||
      includesIgnoreCase(formatDate(row.movementAt), query) ||
      includesIgnoreCase(formatMonth(row.movementAt), query)
    );
  });
}

export async function fetchSellingPriceRawMeatOptions(): Promise<
  SellingPriceRawMeatOption[]
> {
  const { data, error } = await supabase
    .from("raw_meat_items")
    .select("id,name,sort_order")
    .is("archived_at", null)
    .eq("is_active", true)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as RawMeatOptionRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: toNumber(row.sort_order),
  }));
}

function movementSortKey(row: MovementRow) {
  return row.movement_at || row.bubble_created_at || row.created_at || "";
}

type SourceAggregate = {
  rawMeatWeightKg: number | null;
  inboundUnitPrice: number | null;
  seasoningCode: string | null;
  seasoningPerKg: number | null;
  markupRate: number | null;
  variationRate: number | null;
};

function emptyAggregate(): SourceAggregate {
  return {
    rawMeatWeightKg: null,
    inboundUnitPrice: null,
    seasoningCode: null,
    seasoningPerKg: null,
    markupRate: null,
    variationRate: null,
  };
}

function aggregateSources(
  sources: Array<{
    outboundQuantityKg: number | null;
    inboundUnitPrice: number | null;
    seasoningCode: string | null;
    seasoningPerKg: number | null;
    markupRate: number | null;
    variationRate: number | null;
  }>,
): SourceAggregate {
  if (sources.length === 0) return emptyAggregate();

  let weight = 0;
  let priceSum = 0;
  let priceWeight = 0;
  let seasoningSum = 0;
  let seasoningWeight = 0;
  let seasoningCode: string | null = null;
  let markupRate: number | null = null;
  let variationRate: number | null = null;

  for (const source of sources) {
    const kg = source.outboundQuantityKg ?? 0;
    weight += kg;
    if (source.inboundUnitPrice !== null) {
      priceSum += source.inboundUnitPrice * (kg || 1);
      priceWeight += kg || 1;
    }
    if (source.seasoningPerKg !== null) {
      seasoningSum += source.seasoningPerKg * (kg || 1);
      seasoningWeight += kg || 1;
    }
    if (seasoningCode === null && source.seasoningCode) {
      seasoningCode = source.seasoningCode;
    }
    if (markupRate === null && source.markupRate !== null) {
      markupRate = source.markupRate;
    }
    if (variationRate === null && source.variationRate !== null) {
      variationRate = source.variationRate;
    }
  }

  return {
    rawMeatWeightKg: weight > 0 ? weight : null,
    inboundUnitPrice: priceWeight > 0 ? priceSum / priceWeight : null,
    seasoningCode,
    seasoningPerKg: seasoningWeight > 0 ? seasoningSum / seasoningWeight : 0,
    markupRate,
    variationRate,
  };
}

export async function fetchSellingPriceCostRows(
  rawMeatItemId: string,
): Promise<SellingPriceCostRow[]> {
  const { data: itemData, error: itemError } = await supabase
    .from("prepared_meat_items")
    .select("id,name,kg_per_package,raw_meat_items(id,name)")
    .eq("raw_meat_item_id", rawMeatItemId)
    .is("archived_at", null);

  if (itemError) throw itemError;

  const items = (itemData ?? []) as PreparedItemRow[];
  if (items.length === 0) return [];

  const itemById = new Map(items.map((item) => [item.id, item]));
  const itemIds = items.map((item) => item.id);

  const { data: movementData, error: movementError } = await supabase
    .from("prepared_meat_stock_movements")
    .select(
      "id,movement_at,inbound_packages,prepared_meat_item_id,bubble_created_at,created_at",
    )
    .in("prepared_meat_item_id", itemIds)
    .gt("inbound_packages", 0)
    .order("movement_at", { ascending: false, nullsFirst: false });

  if (movementError) throw movementError;

  const movements = (movementData ?? []) as MovementRow[];
  if (movements.length === 0) return [];

  const movementIds = movements.map((row) => row.id);

  const { data: sourceData, error: sourceError } = await supabase
    .from("prepared_meat_stock_raw_sources")
    .select(
      "prepared_movement_id,raw_stock_movement_id,raw_meat_stock_movements(outbound_quantity_kg,applied_seasoning_code,applied_seasoning_per_kg,applied_markup_rate,applied_variation_rate)",
    )
    .in("prepared_movement_id", movementIds);

  if (sourceError) throw sourceError;

  const sources = (sourceData ?? []) as SourceRow[];
  const rawIds = [
    ...new Set(
      sources
        .map((row) => row.raw_stock_movement_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const priceByRawId = new Map<string, number>();
  if (rawIds.length > 0) {
    const { data: relationData, error: relationError } = await supabase
      .from("raw_meat_stock_relations")
      .select("movement_id,inbound_movement_id")
      .in("movement_id", rawIds);
    if (relationError) throw relationError;

    const relations = (relationData ?? []) as RelationRow[];
    const inboundIds = [
      ...new Set(relations.map((row) => row.inbound_movement_id)),
    ];

    const inboundPriceById = new Map<string, number | null>();
    if (inboundIds.length > 0) {
      const { data: inboundData, error: inboundError } = await supabase
        .from("raw_meat_stock_movements")
        .select("id,inbound_unit_price")
        .in("id", inboundIds);
      if (inboundError) throw inboundError;
      for (const row of (inboundData ?? []) as InboundPriceRow[]) {
        inboundPriceById.set(row.id, toNumber(row.inbound_unit_price));
      }
    }

    const weighted = new Map<string, { sum: number; weight: number }>();
    for (const relation of relations) {
      const price = inboundPriceById.get(relation.inbound_movement_id);
      if (price === undefined || price === null) continue;
      const current = weighted.get(relation.movement_id) ?? {
        sum: 0,
        weight: 0,
      };
      current.sum += price;
      current.weight += 1;
      weighted.set(relation.movement_id, current);
    }
    for (const [rawId, value] of weighted) {
      if (value.weight > 0) priceByRawId.set(rawId, value.sum / value.weight);
    }
  }

  const sourcesByMovement = new Map<string, SourceRow[]>();
  for (const source of sources) {
    const list = sourcesByMovement.get(source.prepared_movement_id) ?? [];
    list.push(source);
    sourcesByMovement.set(source.prepared_movement_id, list);
  }

  const chronological = [...movements].sort((left, right) => {
    const leftKey = movementSortKey(left);
    const rightKey = movementSortKey(right);
    if (leftKey === rightKey) return left.id.localeCompare(right.id);
    return leftKey < rightKey ? 1 : -1;
  });

  return chronological.map((movement) => {
    const prepared = movement.prepared_meat_item_id
      ? itemById.get(movement.prepared_meat_item_id)
      : undefined;
    const rawMeat = relatedOne(prepared?.raw_meat_items);
    const packages = toNumber(movement.inbound_packages);
    const kgPerPackage = toNumber(prepared?.kg_per_package);
    const yieldKg =
      packages !== null && kgPerPackage !== null
        ? packages * kgPerPackage
        : null;

    const aggregated = aggregateSources(
      (sourcesByMovement.get(movement.id) ?? []).map((source) => {
        const raw = relatedOne(source.raw_meat_stock_movements);
        return {
          outboundQuantityKg: toNumber(raw?.outbound_quantity_kg),
          inboundUnitPrice: source.raw_stock_movement_id
            ? (priceByRawId.get(source.raw_stock_movement_id) ?? null)
            : null,
          seasoningCode: formatSeasoningCode(raw?.applied_seasoning_code),
          seasoningPerKg: toNumber(raw?.applied_seasoning_per_kg),
          markupRate: toNumber(raw?.applied_markup_rate),
          variationRate: toNumber(raw?.applied_variation_rate),
        };
      }),
    );

    const computed = computeSellingPriceCost({
      rawMeatWeightKg: aggregated.rawMeatWeightKg,
      inboundUnitPrice: aggregated.inboundUnitPrice,
      seasoningPerKg: aggregated.seasoningPerKg,
      yieldKg,
      markupRate: aggregated.markupRate,
      variationRate: aggregated.variationRate,
    });

    return {
      id: movement.id,
      movementAt:
        movement.movement_at ||
        movement.bubble_created_at ||
        movement.created_at,
      productName: prepared?.name ?? "",
      rawMeatName: rawMeat?.name ?? "",
      rawMeatWeightKg: aggregated.rawMeatWeightKg,
      inboundUnitPrice: aggregated.inboundUnitPrice,
      seasoningCode: aggregated.seasoningCode,
      seasoningPerKg: aggregated.seasoningPerKg,
      seasoningCost: computed.seasoningCost,
      yieldKg,
      yieldPercent: computed.yieldPercent,
      totalCost: computed.totalCost,
      markupRate: aggregated.markupRate,
      yieldDifferencePerKg: computed.yieldDifferencePerKg,
      variationRate: aggregated.variationRate,
      listPricePerKg: computed.listPricePerKg,
    };
  });
}

/** Arithmetic mean of 工場 prices for the rows that can be priced. */
export function averageFactorySupplyPrice(rows: SellingPriceCostRow[]) {
  const priced = rows.flatMap((row) => {
    if (
      row.rawMeatWeightKg === null ||
      row.inboundUnitPrice === null ||
      row.yieldKg === null
    ) {
      return [];
    }
    const computed = computeMonthlyMeatUnitPrices({
      outboundKg: row.rawMeatWeightKg,
      inboundUnitPrice: row.inboundUnitPrice,
      seasoningPerKg: row.seasoningPerKg,
      yieldKg: row.yieldKg,
      variationRate: row.variationRate,
      markupRate: row.markupRate,
    });
    return computed ? [computed] : [];
  });
  return averageMonthlyMeatPrices(priced)?.roomPrice ?? null;
}

export type MonthlyMeatPricePushResult = {
  status: string;
  month_start?: string;
  shop_price?: number;
  room_price?: number;
  shop_rows?: number;
  room_rows?: number;
  version_count?: number;
};

export async function pushSellingPriceMonthlyPrices(
  rawMeatItemId: string,
  yearMonth: string,
): Promise<MonthlyMeatPricePushResult> {
  if (!isHongKongYearMonth(yearMonth)) {
    throw new Error("year month is required");
  }

  const { data, error } = await supabase.rpc("push_monthly_meat_prices", {
    p_raw_meat_item_id: rawMeatItemId,
    p_year_month: yearMonth,
  });
  if (error) throw error;
  return (data ?? { status: "updated" }) as MonthlyMeatPricePushResult;
}
