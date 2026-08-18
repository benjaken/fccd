import { supabase } from "@/lib/supabase";

export const QUOTES_PAGE_SIZE = 15;
export const LARGE_QUOTE_THRESHOLD = 10_000;

export type QuotePreset =
  | "all"
  | "high-chance"
  | "large"
  | "follow-up"
  | "pending"
  | "upcoming";

export type QuoteListItem = {
  id: string;
  orderNumber: string | null;
  customerName: string | null;
  companyName: string | null;
  quoteStatus: string | null;
  grandTotal: number | null;
  currency: string;
  deliveryAt: string | null;
  createdAt: string;
  sourceSystem: string | null;
};

export type QuoteListResult = {
  items: QuoteListItem[];
  total: number;
};

export type QuoteListFilters = {
  page: number;
  search: string;
  status: string;
  preset?: QuotePreset;
  now?: Date;
};

type QuoteRow = {
  id: string;
  order_number: string | null;
  customer_name_snapshot: string | null;
  company_name_snapshot: string | null;
  quote_status: string | null;
  grand_total: number | string | null;
  currency: string | null;
  delivery_at: string | null;
  bubble_created_at: string | null;
  created_at: string;
  source_system: string | null;
};

const OPEN_QUOTE_STATUS =
  'quote_status.is.null,quote_status.not.in.("Done Deal","Case Closed")';

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
}: QuoteListFilters): Promise<QuoteListResult> {
  const start = (page - 1) * QUOTES_PAGE_SIZE;
  const end = start + QUOTES_PAGE_SIZE - 1;
  let query = supabase
    .from("orders")
    .select(
      "id,order_number,customer_name_snapshot,company_name_snapshot,quote_status,grand_total,currency,delivery_at,bubble_created_at,created_at,source_system",
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
    // EmailMeForm inquiries synced into the system that still need a quote.
    query = query.eq("source_system", "emailmeform").or(OPEN_QUOTE_STATUS);
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

  if (status) {
    query = query.eq("quote_status", status);
  }

  if (preset === "upcoming") {
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

  return {
    items: ((data ?? []) as QuoteRow[]).map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      customerName: row.customer_name_snapshot,
      companyName: row.company_name_snapshot,
      quoteStatus: row.quote_status,
      grandTotal:
        row.grand_total === null ? null : Number.parseFloat(String(row.grand_total)),
      currency: row.currency || "HKD",
      deliveryAt: row.delivery_at,
      createdAt: row.bubble_created_at || row.created_at,
      sourceSystem: row.source_system,
    })),
    total: count ?? 0,
  };
}
