import { supabase } from "@/lib/supabase";

export const UPCOMING_QUOTE_DAYS = 14;

export type DashboardQuoteItem = {
  id: string;
  orderNumber: string | null;
  customerName: string | null;
  companyName: string | null;
  quoteStatus: string | null;
  deliveryAt: string | null;
  createdAt: string;
  sourceSystem: string | null;
};

export type OrdersDashboardData = {
  shopifyPending: number;
  unpaid: number;
  notSentToFactory: number;
  pendingQuotes: number;
  upcomingQuotes: number;
  latestPendingQuotes: DashboardQuoteItem[];
  soonestUpcomingQuotes: DashboardQuoteItem[];
};

type QuoteRow = {
  id: string;
  order_number: string | null;
  customer_name_snapshot: string | null;
  company_name_snapshot: string | null;
  quote_status: string | null;
  delivery_at: string | null;
  bubble_created_at: string | null;
  created_at: string;
  source_system: string | null;
};

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

function dashboardDayBounds(now: Date) {
  const { year, month, day } = hongKongDateParts(now);
  const today = isoDate(year, month, day);
  const upcoming = isoDate(year, month, day + UPCOMING_QUOTE_DAYS);

  return {
    todayStart: `${today}T00:00:00+08:00`,
    upcomingStart: `${upcoming}T00:00:00+08:00`,
  };
}

function mapQuote(row: QuoteRow): DashboardQuoteItem {
  return {
    id: row.id,
    orderNumber: row.order_number,
    customerName: row.customer_name_snapshot,
    companyName: row.company_name_snapshot,
    quoteStatus: row.quote_status,
    deliveryAt: row.delivery_at,
    createdAt: row.bubble_created_at || row.created_at,
    sourceSystem: row.source_system,
  };
}

function requireSuccess(error: { message: string } | null) {
  if (error) throw error;
}

const QUOTE_QUERY_FIELDS =
  "id,order_number,customer_name_snapshot,company_name_snapshot,quote_status,delivery_at,bubble_created_at,created_at,source_system";

export async function fetchOrdersDashboardData(
  now = new Date(),
): Promise<OrdersDashboardData> {
  const { todayStart, upcomingStart } = dashboardDayBounds(now);
  const openQuoteStatus = 'quote_status.is.null,quote_status.not.in.("Done Deal","Case Closed")';
  const notSentToFactory = "is_sent_to_factory.is.null,is_sent_to_factory.eq.false";
  const shopifyPending = "delivery_status.is.null," + notSentToFactory;

  const [
    shopifyPendingResult,
    unpaidResult,
    notSentToFactoryResult,
    pendingQuotesResult,
    upcomingQuotesResult,
    latestPendingResult,
    soonestUpcomingResult,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("document_type", "order")
      .eq("is_shopify_order", true)
      .eq("source_system", "shopify")
      .is("archived_at", null)
      .or(shopifyPending),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("document_type", "order")
      .gt("outstanding", 0)
      .is("archived_at", null),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("document_type", "order")
      .is("archived_at", null)
      .or(notSentToFactory),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("document_type", "quote")
      .eq("source_system", "emailmeform")
      .is("archived_at", null)
      .or(openQuoteStatus),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("document_type", "quote")
      .is("archived_at", null)
      .gte("delivery_at", todayStart)
      .lt("delivery_at", upcomingStart)
      .or(openQuoteStatus),
    supabase
      .from("orders")
      .select(QUOTE_QUERY_FIELDS)
      .eq("document_type", "quote")
      .eq("source_system", "emailmeform")
      .is("archived_at", null)
      .or(openQuoteStatus)
      .order("bubble_created_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("orders")
      .select(QUOTE_QUERY_FIELDS)
      .eq("document_type", "quote")
      .is("archived_at", null)
      .gte("delivery_at", todayStart)
      .lt("delivery_at", upcomingStart)
      .or(openQuoteStatus)
      .order("delivery_at", { ascending: true })
      .limit(8),
  ]);

  [
    shopifyPendingResult,
    unpaidResult,
    notSentToFactoryResult,
    pendingQuotesResult,
    upcomingQuotesResult,
    latestPendingResult,
    soonestUpcomingResult,
  ].forEach((result) => requireSuccess(result.error));

  return {
    shopifyPending: shopifyPendingResult.count ?? 0,
    unpaid: unpaidResult.count ?? 0,
    notSentToFactory: notSentToFactoryResult.count ?? 0,
    pendingQuotes: pendingQuotesResult.count ?? 0,
    upcomingQuotes: upcomingQuotesResult.count ?? 0,
    latestPendingQuotes: ((latestPendingResult.data ?? []) as QuoteRow[]).map(
      mapQuote,
    ),
    soonestUpcomingQuotes: (
      (soonestUpcomingResult.data ?? []) as QuoteRow[]
    ).map(mapQuote),
  };
}
