import { supabase } from "@/lib/supabase";

export type FollowUpCounts = {
  pendingEntry: number;
  pendingQuote: number;
  pendingPayment: number;
  pendingFactory: number;
  pendingDriver: number;
  customerOrderInquiries: number;
};

export const FOLLOW_UP_COUNTS_CHANGED = "fccd:follow-up-counts-changed";

const FOLLOW_UP_COUNT_KEYS: ReadonlySet<keyof FollowUpCounts> = new Set([
  "pendingEntry",
  "pendingQuote",
  "pendingPayment",
  "pendingFactory",
  "pendingDriver",
  "customerOrderInquiries",
]);

export function followUpCountForKey(
  counts: FollowUpCounts | null,
  key: string,
) {
  if (!counts || !FOLLOW_UP_COUNT_KEYS.has(key as keyof FollowUpCounts)) {
    return undefined;
  }
  return counts[key as keyof FollowUpCounts];
}

function hongKongDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function requireCount(
  result: { count: number | null; error: { message: string } | null },
) {
  if (result.error) throw result.error;
  return result.count ?? 0;
}

export async function fetchFollowUpCounts(
  now = new Date(),
): Promise<FollowUpCounts> {
  const todayStart = `${hongKongDateKey(now)}T00:00:00+08:00`;
  const countSelection = { count: "exact" as const, head: true };
  const [entry, quote, payment, factory, driver, customerOrderInquiries] = await Promise.all([
    supabase
      .from("orders")
      .select("id", countSelection)
      .eq("document_type", "order")
      .is("archived_at", null)
      .or(
        "addon_shopify_pending.eq.true,and(is_shopify_order.eq.true,source_system.eq.shopify,delivery_status.is.null,do_not_send_to_factory.eq.false)",
      ),
    supabase
      .from("enquiry_submissions")
      .select("id", countSelection)
      .is("converted_quote_id", null),
    supabase
      .from("orders")
      .select("id", countSelection)
      .eq("document_type", "order")
      .is("archived_at", null)
      .gt("outstanding", 0),
    supabase
      .from("orders")
      .select("id", countSelection)
      .eq("document_type", "order")
      .is("archived_at", null)
      .eq("is_sent_to_factory", false)
      .eq("do_not_send_to_factory", false)
      .gt("grand_total", 0)
      .gte("delivery_at", todayStart),
    supabase
      .from("orders")
      .select("id", countSelection)
      .eq("document_type", "order")
      .is("archived_at", null)
      .eq("delivery_status", "待接單"),
    supabase.rpc("customer_service_order_inquiries_pending_count"),
  ]);

  if (customerOrderInquiries.error) throw customerOrderInquiries.error;

  return {
    pendingEntry: requireCount(entry),
    pendingQuote: requireCount(quote),
    pendingPayment: requireCount(payment),
    pendingFactory: requireCount(factory),
    pendingDriver: requireCount(driver),
    customerOrderInquiries: Number(customerOrderInquiries.data ?? 0),
  };
}
