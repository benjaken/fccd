import { supabase } from "@/lib/supabase";

export const QUOTE_CUSTOMERS_PAGE_SIZE = 15;
export const QUOTE_CUSTOMER_ORDERS_PAGE_SIZE = 25;
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
  total: number;
  remarks: QuoteCustomerRemark[];
};

export type QuoteCustomerHistoryFilters = {
  email: string;
  page: number;
  search: string;
};

export const QUOTE_CUSTOMER_MESSAGE_TABS = [
  "complaint",
  "like",
  "note",
] as const;

export type QuoteCustomerMessageTab =
  (typeof QUOTE_CUSTOMER_MESSAGE_TABS)[number];

export type QuoteCustomerMessage = {
  id: string;
  tab: QuoteCustomerMessageTab;
  body: string;
  authorName: string | null;
  replyEmail: string | null;
  orderNumber: string | null;
  orderId: string | null;
  documentType: string | null;
  createdAt: string;
};

export type CreateQuoteCustomerNoteInput = {
  email: string;
  body: string;
  authorName?: string | null;
  orderId?: string | null;
  replyToEmail?: string | null;
};

export type QuoteCustomerMessages = Record<
  QuoteCustomerMessageTab,
  QuoteCustomerMessage[]
>;

const MESSAGE_CATEGORY_BY_TAB: Record<QuoteCustomerMessageTab, string> = {
  complaint: "orderdislike",
  like: "orderlike",
  note: "customer note",
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

type TimelineMessageRow = {
  id: string;
  category: string | null;
  comment: string;
  author_name_snapshot: string | null;
  order_id: string | null;
  bubble_created_at: string | null;
  created_at: string;
  orders:
    | {
        order_number: string | null;
        document_type: string | null;
      }
    | {
        order_number: string | null;
        document_type: string | null;
      }[]
    | null;
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

export function namedQuoteCustomerCompanies(
  companies: QuoteCustomerCompany[],
) {
  return companies.filter((company) => company.companyName?.trim());
}

export function summarizeCompanies(
  companies: QuoteCustomerCompany[],
  empty = "—",
) {
  const named = namedQuoteCustomerCompanies(companies);
  return {
    primaryName: named[0]?.companyName?.trim() || empty,
    extraCount: Math.max(0, named.length - 1),
    total: named.length,
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

export function messageTabFromCategory(
  category: string | null | undefined,
): QuoteCustomerMessageTab | null {
  const value = category?.trim().toLowerCase();
  if (value === "orderdislike") return "complaint";
  if (value === "orderlike") return "like";
  if (value === "customer note") return "note";
  return null;
}

export function emptyQuoteCustomerMessages(): QuoteCustomerMessages {
  return { complaint: [], like: [], note: [] };
}

function relatedOrder(value: TimelineMessageRow["orders"]) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

const EMAIL_REPLY_PATTERN =
  /^(.+?)\s+email\s*回覆\s*(?:<a\b[^>]*>)?([^\s<]+)(?:<\/a>)?\s*([\s\S]*)$/iu;

function stripCommentMarkup(value: string) {
  return value.replace(/<\/?a\b[^>]*>/gi, " ").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}

export function parseQuoteCustomerNoteComment(
  comment: string,
  fallbackAuthor?: string | null,
) {
  const match = comment.trim().match(EMAIL_REPLY_PATTERN);
  if (!match) {
    return {
      authorName: fallbackAuthor?.trim() || null,
      replyEmail: null,
      body: stripCommentMarkup(comment),
    };
  }

  return {
    authorName: match[1].trim() || fallbackAuthor?.trim() || null,
    replyEmail: match[2].trim(),
    body: stripCommentMarkup(match[3]),
  };
}

export function formatQuoteCustomerEmailReply(
  authorName: string,
  email: string,
  body: string,
) {
  return `${authorName.trim()} email 回覆${email.trim()} ${body.trim()}`.trim();
}

export function mapQuoteCustomerMessage(
  row: TimelineMessageRow,
): QuoteCustomerMessage | null {
  const tab = messageTabFromCategory(row.category);
  if (!tab) return null;
  const order = relatedOrder(row.orders);
  const parsed = parseQuoteCustomerNoteComment(
    row.comment,
    row.author_name_snapshot,
  );
  return {
    id: row.id,
    tab,
    body: parsed.body,
    authorName: parsed.authorName,
    replyEmail: parsed.replyEmail,
    orderNumber: order?.order_number ?? null,
    orderId: row.order_id,
    documentType: order?.document_type ?? null,
    createdAt: row.bubble_created_at || row.created_at,
  };
}

export function groupQuoteCustomerMessages(
  rows: QuoteCustomerMessage[],
): QuoteCustomerMessages {
  const grouped = emptyQuoteCustomerMessages();
  const sorted = [...rows].sort((left, right) =>
    (left.createdAt || "").localeCompare(right.createdAt || ""),
  );
  for (const message of sorted) grouped[message.tab].push(message);
  return grouped;
}

function optionalAmount(value: number | string | null | undefined) {
  return value === null || value === undefined
    ? null
    : Number.parseFloat(String(value));
}

function mapCompanies(value: QuoteCustomerCompany[] | null) {
  if (!Array.isArray(value)) return [];
  return namedQuoteCustomerCompanies(
    value.map((company) => ({
      companyName: company.companyName ?? null,
      tag: company.tag ?? null,
      orderId: company.orderId ?? null,
      documentType: company.documentType ?? null,
    })),
  );
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

export async function fetchQuoteCustomerHistory({
  email,
  page,
  search,
}: QuoteCustomerHistoryFilters): Promise<QuoteCustomerHistory> {
  const offset = (page - 1) * QUOTE_CUSTOMER_ORDERS_PAGE_SIZE;
  const term = safeCustomerSearchTerm(search);
  let query = supabase
    .from("orders")
    .select(
      "id,order_number,document_type,customer_name_snapshot,company_name_snapshot,grand_total,currency,customer_note_snapshot,bubble_created_at,created_at",
      { count: "exact" },
    )
    .is("archived_at", null)
    .ilike("email_snapshot", email);

  if (term) {
    const like = `%${term}%`;
    query = query.or(
      `company_name_snapshot.ilike.${like},order_number.ilike.${like},customer_name_snapshot.ilike.${like}`,
    );
  }

  const { data, error, count } = await query
    .order("bubble_created_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + QUOTE_CUSTOMER_ORDERS_PAGE_SIZE - 1);

  if (error) throw error;

  const orders = ((data ?? []) as HistoryOrderRow[]).map((row) => ({
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

  return {
    orders,
    total: count ?? orders.length,
    remarks: [],
  };
}

export async function fetchQuoteCustomerMessages(
  email: string,
): Promise<QuoteCustomerMessages> {
  const { data, error } = await supabase
    .from("order_timeline_entries")
    .select(
      "id,category,comment,author_name_snapshot,order_id,bubble_created_at,created_at,orders(order_number,document_type)",
    )
    .ilike("customer_email_snapshot", email)
    .order("bubble_created_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(QUOTE_CUSTOMER_HISTORY_LIMIT);

  if (error) throw error;

  const messages = ((data ?? []) as TimelineMessageRow[])
    .map(mapQuoteCustomerMessage)
    .filter((message): message is QuoteCustomerMessage => Boolean(message));

  return groupQuoteCustomerMessages(messages);
}

export async function createQuoteCustomerNote({
  email,
  body,
  authorName,
  orderId,
  replyToEmail,
}: CreateQuoteCustomerNoteInput): Promise<QuoteCustomerMessage> {
  const trimmedBody = body.trim();
  if (!trimmedBody) throw new Error("quote_customers_note_empty");
  const trimmedAuthor = authorName?.trim() || null;
  const trimmedReplyTo = replyToEmail?.trim() || null;
  const comment =
    trimmedAuthor && trimmedReplyTo
      ? formatQuoteCustomerEmailReply(trimmedAuthor, trimmedReplyTo, trimmedBody)
      : trimmedBody;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("order_timeline_entries")
    .insert({
      legacy_id: `web-customer-note-${crypto.randomUUID()}`,
      category: MESSAGE_CATEGORY_BY_TAB.note,
      comment,
      customer_email_snapshot: email,
      author_name_snapshot: trimmedAuthor,
      order_id: orderId || null,
      bubble_created_at: now,
      bubble_modified_at: now,
    })
    .select(
      "id,category,comment,author_name_snapshot,order_id,bubble_created_at,created_at,orders(order_number,document_type)",
    )
    .single();

  if (error) throw error;
  const message = mapQuoteCustomerMessage(data as TimelineMessageRow);
  if (!message) throw new Error("quote_customers_note_failed");
  return message;
}
