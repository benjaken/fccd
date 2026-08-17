import { supabase } from "@/lib/supabase";

export const QUOTE_CUSTOMERS_PAGE_SIZE = 15;
export const QUOTE_CUSTOMER_HISTORY_LIMIT = 1000;

export type QuoteCustomerCompany = {
  companyName: string | null;
  tag: string | null;
  orderId: string | null;
  documentType: string | null;
};

export type QuoteCustomerListItem = {
  email: string;
  customerName: string | null;
  latestOrderNumber: string | null;
  latestOrderId: string | null;
  latestDocumentType: string | null;
  companies: QuoteCustomerCompany[];
  orderCount: number;
  orderTotal: number;
  currency: string;
  hasRemarks: boolean;
};

export type QuoteCustomerListResult = {
  items: QuoteCustomerListItem[];
  total: number;
};

export type QuoteCustomerListFilters = {
  page: number;
  search: string;
  sort: "order_total" | "order_count";
  ascending: boolean;
};

export type QuoteCustomerHistoryOrder = {
  id: string;
  orderNumber: string | null;
  documentType: string | null;
  customerName: string | null;
  companyName: string | null;
  grandTotal: number | null;
  currency: string;
  customerNote: string | null;
  createdAt: string;
};

export type QuoteCustomerRemark = {
  id: string;
  body: string;
  orderNumber: string | null;
  createdAt: string | null;
};

export type QuoteCustomerHistory = {
  orders: QuoteCustomerHistoryOrder[];
  remarks: QuoteCustomerRemark[];
};

type QuoteCustomerRow = {
  email: string;
  customer_name: string | null;
  latest_order_number: string | null;
  latest_order_id: string | null;
  latest_document_type: string | null;
  companies: QuoteCustomerCompany[] | null;
  order_count: number | string;
  order_total: number | string;
  currency: string | null;
  has_remarks: boolean | null;
  total_count: number | string;
};

type HistoryOrderRow = {
  id: string;
  order_number: string | null;
  document_type: string | null;
  customer_name_snapshot: string | null;
  company_name_snapshot: string | null;
  grand_total: number | string | null;
  currency: string | null;
  customer_note_snapshot: string | null;
  bubble_created_at: string | null;
  created_at: string;
};

type TimelineRow = {
  id: string;
  comment: string;
  order_id: string | null;
  bubble_created_at: string | null;
  created_at: string;
};

export function safeCustomerSearchTerm(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s@+\-._#]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatLabeledValue(
  label: string | null | undefined,
  value: string | null | undefined,
  empty = "—",
) {
  return `${label?.trim() || empty} : ${value?.trim() || empty}`;
}

export function documentPath(
  documentType: string | null | undefined,
  id: string,
) {
  return documentType === "quote" ? `/quotes/${id}` : `/orders/${id}`;
}

export function summarizeCompanies(
  companies: QuoteCustomerCompany[],
  empty = "—",
) {
  const named = companies.filter((company) => company.companyName?.trim());
  const primary = named[0]?.companyName?.trim() || companies[0]?.companyName?.trim();
  return {
    primaryName: primary || empty,
    extraCount: Math.max(0, companies.length - 1),
    total: companies.length,
  };
}

export function sortOrdersByCompany(orders: QuoteCustomerHistoryOrder[]) {
  return [...orders].sort((left, right) => {
    const company = (left.companyName || "").localeCompare(
      right.companyName || "",
      "zh-Hant",
    );
    if (company !== 0) return company;
    return (right.createdAt || "").localeCompare(left.createdAt || "");
  });
}

function optionalAmount(value: number | string | null | undefined) {
  return value === null || value === undefined
    ? null
    : Number.parseFloat(String(value));
}

function mapCompanies(value: QuoteCustomerCompany[] | null) {
  if (!Array.isArray(value)) return [];
  return value.map((company) => ({
    companyName: company.companyName ?? null,
    tag: company.tag ?? null,
    orderId: company.orderId ?? null,
    documentType: company.documentType ?? null,
  }));
}

export function mapQuoteCustomerRow(row: QuoteCustomerRow): QuoteCustomerListItem {
  return {
    email: row.email,
    customerName: row.customer_name,
    latestOrderNumber: row.latest_order_number,
    latestOrderId: row.latest_order_id,
    latestDocumentType: row.latest_document_type,
    companies: mapCompanies(row.companies),
    orderCount: Number(row.order_count) || 0,
    orderTotal: Number(row.order_total) || 0,
    currency: row.currency || "HKD",
    hasRemarks: Boolean(row.has_remarks),
  };
}

export async function fetchQuoteCustomers({
  page,
  search,
  sort,
  ascending,
}: QuoteCustomerListFilters): Promise<QuoteCustomerListResult> {
  const offset = (page - 1) * QUOTE_CUSTOMERS_PAGE_SIZE;
  const { data, error } = await supabase.rpc("list_quote_customers", {
    p_search: safeCustomerSearchTerm(search),
    p_sort: sort,
    p_ascending: ascending,
    p_limit: QUOTE_CUSTOMERS_PAGE_SIZE,
    p_offset: offset,
  });
  if (error) throw error;

  const rows = (data ?? []) as QuoteCustomerRow[];
  return {
    items: rows.map(mapQuoteCustomerRow),
    total: rows.length === 0 ? 0 : Number(rows[0].total_count) || 0,
  };
}

export async function fetchQuoteCustomerHistory(
  email: string,
): Promise<QuoteCustomerHistory> {
  const [ordersResult, timelineResult] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id,order_number,document_type,customer_name_snapshot,company_name_snapshot,grand_total,currency,customer_note_snapshot,bubble_created_at,created_at",
      )
      .is("archived_at", null)
      .ilike("email_snapshot", email)
      .order("bubble_created_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(QUOTE_CUSTOMER_HISTORY_LIMIT),
    supabase
      .from("order_timeline_entries")
      .select("id,comment,order_id,bubble_created_at,created_at")
      .ilike("customer_email_snapshot", email)
      .order("bubble_created_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(QUOTE_CUSTOMER_HISTORY_LIMIT),
  ]);

  if (ordersResult.error) throw ordersResult.error;
  if (timelineResult.error) throw timelineResult.error;

  const orders = ((ordersResult.data ?? []) as HistoryOrderRow[]).map((row) => ({
    id: row.id,
    orderNumber: row.order_number,
    documentType: row.document_type,
    customerName: row.customer_name_snapshot,
    companyName: row.company_name_snapshot,
    grandTotal: optionalAmount(row.grand_total),
    currency: row.currency || "HKD",
    customerNote: row.customer_note_snapshot,
    createdAt: row.bubble_created_at || row.created_at,
  }));

  const orderNumbers = new Map(
    orders.map((order) => [order.id, order.orderNumber]),
  );
  const remarks: QuoteCustomerRemark[] = [];
  const seenNotes = new Set<string>();

  for (const order of orders) {
    const body = order.customerNote?.trim();
    if (!body || seenNotes.has(body)) continue;
    seenNotes.add(body);
    remarks.push({
      id: `note-${order.id}`,
      body,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
    });
  }

  for (const row of (timelineResult.data ?? []) as TimelineRow[]) {
    const body = row.comment?.trim();
    if (!body || seenNotes.has(body)) continue;
    seenNotes.add(body);
    remarks.push({
      id: row.id,
      body,
      orderNumber: row.order_id ? orderNumbers.get(row.order_id) ?? null : null,
      createdAt: row.bubble_created_at || row.created_at,
    });
  }

  return { orders, remarks };
}
