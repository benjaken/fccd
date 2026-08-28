import {
  createDictItem,
  fetchDictItems,
  fetchDictTypes,
  updateDictItem,
  DICT_TYPE,
} from "@/lib/dictionaries";
import { supabase } from "@/lib/supabase";

export type OrderQuoteOptionKind =
  | "quote-sales-sources"
  | "quote-communication-channels"
  | "festivals"
  | "quote-terms"
  | "quote-payments";

export const ORDER_QUOTE_OPTION_KINDS: readonly OrderQuoteOptionKind[] = [
  "quote-sales-sources",
  "quote-communication-channels",
  "festivals",
  "quote-terms",
  "quote-payments",
];

export function isOrderQuoteOptionKind(value: string): value is OrderQuoteOptionKind {
  return ORDER_QUOTE_OPTION_KINDS.includes(value as OrderQuoteOptionKind);
}

export type OrderQuoteOption = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string | null;
};

export type OrderQuoteOptionInput = Pick<
  OrderQuoteOption,
  "name" | "isActive"
>;

type NamedRow = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string | null;
};

const TABLES: Partial<Record<OrderQuoteOptionKind, string>> = {
  "quote-sales-sources": "quote_sales_sources",
  "quote-communication-channels": "quote_communication_channels",
  festivals: "festivals",
};

const DICTIONARY_CODES: Partial<Record<OrderQuoteOptionKind, string>> = {
  "quote-terms": DICT_TYPE.quoteTermTemplate,
  "quote-payments": DICT_TYPE.quotePaymentTemplate,
};

export const MOVED_ORDER_DICTIONARY_CODES: ReadonlySet<string> = new Set([
  DICT_TYPE.quoteTermTemplate,
  DICT_TYPE.quotePaymentTemplate,
]);

export function filterGenericDictionaryTypes<T extends { code: string }>(
  rows: readonly T[],
) {
  return rows.filter((row) => !MOVED_ORDER_DICTIONARY_CODES.has(row.code));
}

function sortOptions(rows: readonly OrderQuoteOption[]) {
  return [...rows].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    const leftTime = left.createdAt ? Date.parse(left.createdAt) : Number.MAX_SAFE_INTEGER;
    const rightTime = right.createdAt ? Date.parse(right.createdAt) : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime || left.name.localeCompare(right.name, "zh-Hant");
  });
}

export function filterOrderQuoteOptions(
  rows: readonly OrderQuoteOption[],
  search = "",
) {
  const term = search.trim().toLocaleLowerCase("zh-HK");
  if (!term) return [...rows];
  return rows.filter((row) =>
    row.name.toLocaleLowerCase("zh-HK").includes(term),
  );
}

export function isLongTextOrderQuoteOption(kind: OrderQuoteOptionKind) {
  return kind === "quote-terms" || kind === "quote-payments";
}

export async function fetchOrderQuoteOptions(
  kind: OrderQuoteOptionKind,
): Promise<OrderQuoteOption[]> {
  const typeCode = DICTIONARY_CODES[kind];
  if (typeCode) {
    const items = await fetchDictItems(typeCode, { includeInactive: true });
    return sortOptions(
      items.map((item) => ({
        id: item.id,
        name: item.label,
        isActive: item.isActive,
        sortOrder: item.sortOrder,
        createdAt: null,
      })),
    );
  }

  const table = TABLES[kind];
  if (!table) return [];
  const { data, error } = await supabase
    .from(table)
    .select("id,name,is_active,created_at")
    .order("created_at", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return sortOptions(
    ((data ?? []) as NamedRow[]).map((row) => ({
      id: row.id,
      name: row.name.trim(),
      isActive: row.is_active,
      sortOrder: 0,
      createdAt: row.created_at,
    })),
  );
}

export async function createOrderQuoteOption(
  kind: OrderQuoteOptionKind,
  input: OrderQuoteOptionInput,
): Promise<OrderQuoteOption> {
  const name = input.name.trim();
  if (!name) throw new Error("name_required");
  const typeCode = DICTIONARY_CODES[kind];
  if (typeCode) {
    const types = await fetchDictTypes({ includeInactive: true });
    const type = types.find((item) => item.code === typeCode);
    if (!type) throw new Error("dictionary_type_missing");
    const existing = await fetchDictItems(typeCode, { includeInactive: true });
    const created = await createDictItem(type.id, {
      value: `web-${crypto.randomUUID()}`,
      label: name,
      sortOrder: Math.max(0, ...existing.map((item) => item.sortOrder)) + 10,
      isActive: input.isActive,
    });
    return {
      id: created.id,
      name: created.label,
      isActive: created.isActive,
      sortOrder: created.sortOrder,
      createdAt: null,
    };
  }

  const table = TABLES[kind];
  if (!table) throw new Error("unsupported_option_kind");
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(table)
    .insert({
      legacy_id: `web-${kind}-${crypto.randomUUID()}`,
      name,
      is_active: input.isActive,
      bubble_created_at: now,
      bubble_modified_at: now,
    })
    .select("id,name,is_active,created_at")
    .single();
  if (error) throw error;
  const row = data as NamedRow;
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    sortOrder: 0,
    createdAt: row.created_at,
  };
}

export async function updateOrderQuoteOption(
  kind: OrderQuoteOptionKind,
  id: string,
  input: Partial<OrderQuoteOptionInput>,
): Promise<OrderQuoteOption> {
  const typeCode = DICTIONARY_CODES[kind];
  if (typeCode) {
    const items = await fetchDictItems(typeCode, { includeInactive: true });
    const current = items.find((item) => item.id === id);
    if (!current) throw new Error("option_missing");
    const updated = await updateDictItem(id, {
      value: current.value,
      label: input.name?.trim() || current.label,
      labelEn: current.labelEn,
      description: current.description,
      metadata: current.metadata,
      sortOrder: current.sortOrder,
      isActive: input.isActive ?? current.isActive,
    });
    return {
      id: updated.id,
      name: updated.label,
      isActive: updated.isActive,
      sortOrder: updated.sortOrder,
      createdAt: null,
    };
  }

  const table = TABLES[kind];
  if (!table) throw new Error("unsupported_option_kind");
  const changes: Record<string, unknown> = {
    bubble_modified_at: new Date().toISOString(),
  };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("name_required");
    changes.name = name;
  }
  if (input.isActive !== undefined) changes.is_active = input.isActive;
  const { data, error } = await supabase
    .from(table)
    .update(changes)
    .eq("id", id)
    .select("id,name,is_active,created_at")
    .single();
  if (error) throw error;
  const row = data as NamedRow;
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    sortOrder: 0,
    createdAt: row.created_at,
  };
}
