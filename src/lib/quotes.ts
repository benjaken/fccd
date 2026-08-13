import { supabase } from "@/lib/supabase";

export const QUOTES_PAGE_SIZE = 15;

export type QuoteListItem = {
  id: string;
  orderNumber: string | null;
  customerName: string | null;
  companyName: string | null;
  quoteStatus: string | null;
  grandTotal: number | null;
  currency: string;
  deliveryAt: string | null;
  updatedAt: string;
};

export type QuoteListResult = {
  items: QuoteListItem[];
  total: number;
};

export type QuoteListFilters = {
  page: number;
  search: string;
  status: string;
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
  updated_at: string;
};

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
}: QuoteListFilters): Promise<QuoteListResult> {
  const start = (page - 1) * QUOTES_PAGE_SIZE;
  const end = start + QUOTES_PAGE_SIZE - 1;
  let query = supabase
    .from("orders")
    .select(
      "id,order_number,customer_name_snapshot,company_name_snapshot,quote_status,grand_total,currency,delivery_at,updated_at",
      { count: "exact" },
    )
    .eq("document_type", "quote")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .range(start, end);

  const term = safeSearchTerm(search);
  if (term) {
    query = query.or(
      `order_number.ilike.%${term}%,customer_name_snapshot.ilike.%${term}%,company_name_snapshot.ilike.%${term}%`,
    );
  }

  if (status) {
    query = query.eq("quote_status", status);
  }

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
      updatedAt: row.updated_at,
    })),
    total: count ?? 0,
  };
}
