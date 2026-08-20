import { supabase } from "@/lib/supabase";

const HONG_KONG_TIME_ZONE = "Asia/Hong_Kong";
const QUERY_PAGE_SIZE = 1_000;

export type KitchenMaterialUsageDetail = {
  id: string;
  productName: string | null;
  productSku: string | null;
  orderId: string | null;
  deliveryAt: string | null;
  productQuantity: number | null;
  quantity: number;
};

export type KitchenMaterialUsageRow = {
  ingredientId: string;
  ingredientName: string;
  ingredientSku: string | null;
  unit: string | null;
  stocktakeQuantity: number | null;
  estimatedUsage: number;
  difference: number | null;
  details: KitchenMaterialUsageDetail[];
};

export type KitchenMaterialUsageReport = {
  rows: KitchenMaterialUsageRow[];
  stocktakeDate: string;
  usageStartDate: string;
  usageEndDate: string;
};

type IngredientRow = {
  id: string;
  name: string | null;
  sku: string | null;
  stocktake_unit: string | null;
};

type ProductRow = { id: string; name: string | null; sku: string | null };

type StocktakeRow = {
  ingredient_id: string | null;
  quantity: number | string | null;
};

type BomRow = {
  id: string;
  ingredient_id: string | null;
  product_id: string | null;
  order_id: string | null;
  delivery_at: string | null;
  calculated_quantity: number | string | null;
  ingredient_quantity: number | string | null;
  product_quantity: number | string | null;
};

type UsageSource = {
  ingredients: IngredientRow[];
  products: ProductRow[];
  stocktakes: StocktakeRow[];
  bomLines: BomRow[];
};

function numberOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function usageForBomLine(line: BomRow) {
  const calculated = numberOrNull(line.calculated_quantity);
  if (calculated !== null) return calculated;
  const ingredientQuantity = numberOrNull(line.ingredient_quantity);
  const productQuantity = numberOrNull(line.product_quantity);
  return ingredientQuantity !== null && productQuantity !== null
    ? ingredientQuantity * productQuantity
    : 0;
}

export function nextHongKongDate(date: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

export function hongKongDateBounds(date: string) {
  return {
    start: `${date}T00:00:00+08:00`,
    end: `${nextHongKongDate(date)}T00:00:00+08:00`,
  };
}

export function hongKongDateKey(value: Date | string = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HONG_KONG_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function buildKitchenMaterialUsageReport(
  source: UsageSource,
  selection: Pick<KitchenMaterialUsageReport, "stocktakeDate" | "usageStartDate" | "usageEndDate">,
): KitchenMaterialUsageReport {
  const ingredients = new Map(source.ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const products = new Map(source.products.map((product) => [product.id, product]));
  const rows = new Map<string, KitchenMaterialUsageRow>();
  const ingredientOrder = new Map<string, number>();
  const stocktakeTotals = new Map<string, number>();
  const numericStocktakes = new Set<string>();

  source.bomLines.forEach((line, index) => {
    if (line.ingredient_id && !ingredientOrder.has(line.ingredient_id)) {
      ingredientOrder.set(line.ingredient_id, index);
    }
  });

  const ensureRow = (ingredientId: string) => {
    const existing = rows.get(ingredientId);
    if (existing) return existing;
    const ingredient = ingredients.get(ingredientId);
    const row: KitchenMaterialUsageRow = {
      ingredientId,
      ingredientName: ingredient?.name?.trim() || "未命名材料",
      ingredientSku: ingredient?.sku ?? null,
      unit: ingredient?.stocktake_unit ?? null,
      stocktakeQuantity: null,
      estimatedUsage: 0,
      difference: 0,
      details: [],
    };
    rows.set(ingredientId, row);
    return row;
  };

  for (const stocktake of source.stocktakes) {
    if (!stocktake.ingredient_id) continue;
    const row = ensureRow(stocktake.ingredient_id);
    const quantity = numberOrNull(stocktake.quantity);
    if (quantity === null) {
      if (!numericStocktakes.has(stocktake.ingredient_id)) row.stocktakeQuantity = null;
      continue;
    }
    numericStocktakes.add(stocktake.ingredient_id);
    const total = (stocktakeTotals.get(stocktake.ingredient_id) ?? 0) + quantity;
    stocktakeTotals.set(stocktake.ingredient_id, total);
    row.stocktakeQuantity = total;
  }

  for (const line of source.bomLines) {
    if (!line.ingredient_id) continue;
    // The original list has one main row per material. Its linked products
    // are revealed from that row via "顯示更多" instead of repeating the
    // material for every BOM line.
    const row = ensureRow(line.ingredient_id);
    const quantity = usageForBomLine(line);
    const product = line.product_id ? products.get(line.product_id) : null;
    row.estimatedUsage += quantity;
    row.details.push({
      id: line.id,
      productName: product?.name ?? null,
      productSku: product?.sku ?? null,
      orderId: line.order_id,
      deliveryAt: line.delivery_at,
      productQuantity: numberOrNull(line.product_quantity),
      quantity,
    });
  }

  const resultRows = [...rows.values()]
    .map((row) => ({
      ...row,
      difference: row.stocktakeQuantity === null
        ? null
        : row.stocktakeQuantity - row.estimatedUsage,
      details: row.details.sort((left, right) =>
        (left.deliveryAt ?? "").localeCompare(right.deliveryAt ?? ""),
      ),
    }))
    .sort((left, right) => {
      const leftOrder = ingredientOrder.get(left.ingredientId);
      const rightOrder = ingredientOrder.get(right.ingredientId);
      if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
      if (leftOrder !== undefined) return -1;
      if (rightOrder !== undefined) return 1;
      return 0;
    });

  return { ...selection, rows: resultRows };
}

async function fetchAllBomLines(start: string, end: string): Promise<BomRow[]> {
  const rows: BomRow[] = [];
  for (let offset = 0; ; offset += QUERY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("order_bom_requirements")
      .select("id,ingredient_id,product_id,order_id,delivery_at,calculated_quantity,ingredient_quantity,product_quantity")
      .not("ingredient_id", "is", null)
      .gte("delivery_at", start)
      .lt("delivery_at", end)
      .order("delivery_at", { ascending: true, nullsFirst: false })
      .range(offset, offset + QUERY_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as BomRow[];
    rows.push(...page);
    if (page.length < QUERY_PAGE_SIZE) return rows;
  }
}

async function fetchRowsByIds<T extends { id: string }>(
  table: "ingredients" | "products",
  columns: string,
  ids: string[],
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < ids.length; start += 200) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in("id", ids.slice(start, start + 200));
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as T[]));
  }
  return rows;
}

export async function fetchLatestIngredientStocktakeDate() {
  const { data, error } = await supabase
    .from("ingredient_stocktake_events")
    .select("stocktake_at")
    .not("stocktake_at", "is", null)
    .order("stocktake_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const value = (data?.[0] as { stocktake_at?: string | null } | undefined)?.stocktake_at;
  return value ? hongKongDateKey(value) : null;
}

export async function fetchKitchenMaterialUsageReport({
  stocktakeDate,
  usageStartDate,
  usageEndDate,
}: Pick<KitchenMaterialUsageReport, "stocktakeDate" | "usageStartDate" | "usageEndDate">): Promise<KitchenMaterialUsageReport> {
  const usageEnd = usageEndDate < usageStartDate ? usageStartDate : usageEndDate;
  const stocktakeBounds = hongKongDateBounds(stocktakeDate);
  const usageBounds = hongKongDateBounds(usageEnd);
  const [bomLines, stocktakeResult] = await Promise.all([
    fetchAllBomLines(hongKongDateBounds(usageStartDate).start, usageBounds.end),
    supabase
      .from("ingredient_stocktake_events")
      .select("ingredient_id,quantity")
      .gte("stocktake_at", stocktakeBounds.start)
      .lt("stocktake_at", stocktakeBounds.end),
  ]);
  if (stocktakeResult.error) throw stocktakeResult.error;

  const ingredientIds = [...new Set([
    ...bomLines.map((line) => line.ingredient_id),
    ...((stocktakeResult.data ?? []) as StocktakeRow[]).map((row) => row.ingredient_id),
  ].filter((id): id is string => Boolean(id)))];
  const productIds = [...new Set(bomLines.map((line) => line.product_id).filter((id): id is string => Boolean(id)))];
  const [ingredients, products] = await Promise.all([
    fetchRowsByIds<IngredientRow>("ingredients", "id,name,sku,stocktake_unit", ingredientIds),
    fetchRowsByIds<ProductRow>("products", "id,name,sku", productIds),
  ]);

  return buildKitchenMaterialUsageReport(
    {
      ingredients,
      products,
      stocktakes: (stocktakeResult.data ?? []) as StocktakeRow[],
      bomLines,
    },
    { stocktakeDate, usageStartDate, usageEndDate: usageEnd },
  );
}
