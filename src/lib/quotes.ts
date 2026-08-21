import { supabase } from "@/lib/supabase";

export const QUOTES_PAGE_SIZE = 15;
export const LARGE_QUOTE_THRESHOLD = 10_000;
export const QUOTE_STATUS_OPTIONS = [
  "Low Chance",
  "High Chance",
  "Done Deal",
  "Case Closed",
] as const;
export const QUOTE_STATUS_UNSET = "__unset__";

export type QuotePreset =
  | "all"
  | "high-chance"
  | "large"
  | "follow-up"
  | "pending"
  | "upcoming";

export type QuoteListItem = {
  id: string;
  brandId?: string | null;
  brandName?: string | null;
  orderNumber: string | null;
  customerName: string | null;
  companyName: string | null;
  quoteDescription?: string | null;
  quoteStatus: string | null;
  grandTotal: number | null;
  currency: string;
  deliveryAt: string | null;
  deliveryTime?: string | null;
  shipOutTime?: string | null;
  contactPhone?: string | null;
  shippingMethodName?: string | null;
  districtName?: string | null;
  quantity?: number;
  createdAt: string;
  sourceSystem: string | null;
  asanaLink?: string | null;
  generatedOrderId?: string | null;
  generatedOrderNumber?: string | null;
};

export type QuoteListResult = {
  items: QuoteListItem[];
  total: number;
};

export type QuoteBrandOption = {
  id: string;
  name: string;
};

export type QuoteListFilters = {
  page: number;
  search: string;
  status: string;
  preset?: QuotePreset;
  now?: Date;
  createdSort?: "ascending" | "descending";
  orderNumberSort?: "ascending" | "descending";
  brandId?: string;
};

type QuoteRow = {
  id: string;
  channel_id: string | null;
  channels: { name: string | null } | { name: string | null }[] | null;
  order_number: string | null;
  customer_name_snapshot: string | null;
  company_name_snapshot: string | null;
  quote_description_snapshot: string | null;
  contact_number_a_snapshot: string | null;
  quote_status: string | null;
  grand_total: number | string | null;
  currency: string | null;
  delivery_at: string | null;
  delivery_time: string | null;
  ship_out_time: string | null;
  shipping_methods:
    | { name: string | null; display_name: string | null }
    | Array<{ name: string | null; display_name: string | null }>
    | null;
  deliveries: Array<{
    delivery_districts:
      | { name: string | null }
      | Array<{ name: string | null }>
      | null;
  }> | null;
  order_lines: Array<{
    quantity: number | string | null;
    is_void: boolean | null;
  }> | null;
  bubble_created_at: string | null;
  created_at: string;
  source_system: string | null;
};

const OPEN_QUOTE_STATUS =
  'quote_status.is.null,quote_status.not.in.("Done Deal","Case Closed")';

export async function fetchQuoteBrands(): Promise<QuoteBrandOption[]> {
  const { data, error } = await supabase
    .from("channels")
    .select("id,name")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) throw error;

  return (data ?? [])
    .filter((row) => row.id && row.name?.trim())
    .map((row) => ({
      id: row.id as string,
      name: row.name.trim(),
    }));
}

function hongKongDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return {
    year: Number(part("year")),
    month: Number(part("month")),
    day: Number(part("day")),
  };
}

function isoDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

export function upcomingQuoteBounds(now: Date, days: number) {
  const { year, month, day } = hongKongDateParts(now);
  const today = isoDate(year, month, day);
  const end = isoDate(year, month, day + days);
  return {
    todayStart: `${today}T00:00:00+08:00`,
    endStart: `${end}T00:00:00+08:00`,
  };
}

function safeSearchTerm(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s@+\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchQuotes({
  page,
  search,
  status,
  preset = "all",
  now = new Date(),
  createdSort,
  orderNumberSort,
  brandId = "",
}: QuoteListFilters): Promise<QuoteListResult> {
  const start = (page - 1) * QUOTES_PAGE_SIZE;
  const end = start + QUOTES_PAGE_SIZE - 1;
  let query = supabase
    .from("orders")
    .select(
      "id,channel_id,order_number,customer_name_snapshot,company_name_snapshot,contact_number_a_snapshot,quote_description_snapshot,quote_status,grand_total,currency,delivery_at,delivery_time,ship_out_time,bubble_created_at,created_at,source_system,channels(name),shipping_methods(name,display_name),deliveries(delivery_districts!district_id(name)),order_lines(quantity,is_void)",
      { count: "exact" },
    )
    .eq("document_type", "quote")
    .is("archived_at", null);

  if (preset === "high-chance") {
    query = query.eq("quote_status", "High Chance");
  } else if (preset === "large") {
    query = query
      .gte("grand_total", LARGE_QUOTE_THRESHOLD)
      .or(OPEN_QUOTE_STATUS);
  } else if (preset === "follow-up") {
    query = query.or(OPEN_QUOTE_STATUS);
  } else if (preset === "pending") {
    // Match the legacy Bubble queue: quotes still open for follow-up.
    query = query.or(OPEN_QUOTE_STATUS);
  } else if (preset === "upcoming") {
    const { todayStart, endStart } = upcomingQuoteBounds(now, 14);
    query = query
      .gte("delivery_at", todayStart)
      .lt("delivery_at", endStart)
      .or(OPEN_QUOTE_STATUS);
  }

  const term = safeSearchTerm(search);
  if (term) {
    query = query.or(
      `order_number.ilike.%${term}%,customer_name_snapshot.ilike.%${term}%,company_name_snapshot.ilike.%${term}%`,
    );
  }

  if (status === QUOTE_STATUS_UNSET) {
    query = query.is("quote_status", null);
  } else if (status) {
    query = query.eq("quote_status", status);
  }
  if (brandId) {
    query = query.eq("channel_id", brandId);
  }

  if (orderNumberSort) {
    query = query
      .order("order_number", {
        ascending: orderNumberSort === "ascending",
        nullsFirst: false,
      })
      .order("bubble_created_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else if (createdSort) {
    query = query
      .order("bubble_created_at", {
        ascending: createdSort === "ascending",
        nullsFirst: false,
      })
      .order("created_at", { ascending: createdSort === "ascending" });
  } else if (preset === "upcoming") {
    // Quotes due soon are driven by the delivery date so colleagues know
    // when to contact the customer.
    query = query
      .order("delivery_at", { ascending: true, nullsFirst: false })
      .order("bubble_created_at", { ascending: false, nullsFirst: false });
  } else {
    // Bubble Created Date (fallback to DB created_at).
    query = query
      .order("bubble_created_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
  }
  query = query.range(start, end);

  const { data, count, error } = await query;
  if (error) throw error;

  const quoteIds = (data ?? []).map((row) => row.id);
  const [asanaResult, generatedOrdersResult] = quoteIds.length
    ? await Promise.all([
        supabase.from("orders").select("id,asana_link").in("id", quoteIds),
        supabase.from("orders").select("id,order_number,source_quote_id").in("source_quote_id", quoteIds).eq("document_type", "order").is("archived_at", null),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const asanaById = new Map(
    asanaResult.error
      ? []
      : (asanaResult.data ?? []).map((row) => [row.id, row.asana_link] as const),
  );
  const generatedOrderByQuoteId = new Map(
    generatedOrdersResult.error
      ? []
      : (generatedOrdersResult.data ?? []).map((row) => [row.source_quote_id, row] as const),
  );

  return {
    items: ((data ?? []) as QuoteRow[]).map((row) => ({
      id: row.id,
      brandId: row.channel_id,
      brandName: Array.isArray(row.channels)
        ? row.channels[0]?.name ?? null
        : row.channels?.name ?? null,
      orderNumber: row.order_number,
      customerName: row.customer_name_snapshot,
      companyName: row.company_name_snapshot,
      quoteDescription: row.quote_description_snapshot,
      quoteStatus: row.quote_status,
      grandTotal:
        row.grand_total === null ? null : Number.parseFloat(String(row.grand_total)),
      currency: row.currency || "HKD",
      deliveryAt: row.delivery_at,
      deliveryTime: row.delivery_time,
      shipOutTime: row.ship_out_time,
      contactPhone: row.contact_number_a_snapshot,
      shippingMethodName: quoteShippingMethodName(row.shipping_methods),
      districtName: quoteDeliveryDistrictName(row.deliveries),
      quantity: (row.order_lines ?? []).reduce(
        (sum, line) =>
          sum +
          (line.is_void || line.quantity === null
            ? 0
            : Number.parseFloat(String(line.quantity)) || 0),
        0,
      ),
      createdAt: row.bubble_created_at || row.created_at,
      sourceSystem: row.source_system,
      asanaLink: asanaById.get(row.id) ?? null,
      generatedOrderId: generatedOrderByQuoteId.get(row.id)?.id ?? null,
      generatedOrderNumber: generatedOrderByQuoteId.get(row.id)?.order_number ?? null,
    })),
    total: count ?? 0,
  };
}

export async function convertQuoteToOrder(quoteId: string) {
  const { data, error } = await supabase.rpc("convert_quote_to_order", {
    p_quote_id: quoteId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error("quote_conversion_failed");
  return { id: row.id as string, orderNumber: row.order_number as string };
}

export async function updateQuoteDescription(
  quoteId: string,
  description: string,
) {
  const value = description.trim();
  const { error } = await supabase
    .from("orders")
    .update({
      quote_description_snapshot: value || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", quoteId)
    .in("document_type", ["quote", "unconfirmed"]);
  if (error) throw error;
}

function quoteShippingMethodName(value: QuoteRow["shipping_methods"]) {
  const method = Array.isArray(value) ? value[0] : value;
  return method?.display_name?.trim() || method?.name?.trim() || null;
}

function quoteDeliveryDistrictName(value: QuoteRow["deliveries"]) {
  const district = value?.[0]?.delivery_districts;
  const row = Array.isArray(district) ? district[0] : district;
  return row?.name?.trim() || null;
}
