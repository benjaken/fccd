import { supabase } from "@/lib/supabase";
import { FOLLOW_UP_COUNTS_CHANGED } from "@/lib/follow-up-counts";

export type CustomerServiceOrderInquiryStatus =
  | "pending"
  | "processing"
  | "notified"
  | "in_progress"
  | "resolved"
  | "failed";

export type CustomerServiceOrderInquiry = {
  id: string;
  environment: string;
  phone: string;
  orderId: string | null;
  orderNumber: string | null;
  kind: string;
  summary: string;
  questions: Array<{ at?: string; text?: string }>;
  messageCount: number;
  status: CustomerServiceOrderInquiryStatus;
  lastCustomerMessageAt: string;
  createdAt: string;
  claimedAt: string | null;
  claimedBy: string | null;
  claimedByName: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
  eventCount: number;
};

export type CustomerServiceOrderInquiryFilters = {
  status?: CustomerServiceOrderInquiryStatus | null;
  search?: string;
  limit?: number;
  offset?: number;
};

export async function fetchCustomerServiceOrderInquiries(
  filters: CustomerServiceOrderInquiryFilters = {},
) {
  const { data, error } = await supabase.rpc(
    "customer_service_order_inquiries_list",
    {
      p_status: filters.status || null,
      p_search: filters.search?.trim() || null,
      p_limit: filters.limit ?? 100,
      p_offset: filters.offset ?? 0,
    },
  );
  if (error) throw error;
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return {
    items: rows.map((row): CustomerServiceOrderInquiry => ({
      id: String(row.id),
      environment: String(row.environment || "production"),
      phone: String(row.phone_normalized || ""),
      orderId: typeof row.order_id === "string" ? row.order_id : null,
      orderNumber: typeof row.order_number === "string" ? row.order_number : null,
      kind: String(row.kind || "order_handoff"),
      summary: String(row.summary || ""),
      questions: Array.isArray(row.questions)
        ? row.questions.filter(
            (item): item is { at?: string; text?: string } =>
              Boolean(item) && typeof item === "object",
          )
        : [],
      messageCount: Number(row.message_count || 0),
      status: String(row.status || "pending") as CustomerServiceOrderInquiryStatus,
      lastCustomerMessageAt: String(row.last_customer_message_at || row.created_at || ""),
      createdAt: String(row.created_at || ""),
      claimedAt: typeof row.claimed_at === "string" ? row.claimed_at : null,
      claimedBy: typeof row.claimed_by === "string" ? row.claimed_by : null,
      claimedByName: typeof row.claimed_by_name === "string" ? row.claimed_by_name : null,
      resolvedAt: typeof row.resolved_at === "string" ? row.resolved_at : null,
      resolvedBy: typeof row.resolved_by === "string" ? row.resolved_by : null,
      resolvedByName: typeof row.resolved_by_name === "string" ? row.resolved_by_name : null,
      resolutionNote: typeof row.resolution_note === "string" ? row.resolution_note : null,
      eventCount: Number(row.event_count || 0),
    })),
    total: Number(rows[0]?.total_count || 0),
  };
}

export async function updateCustomerServiceOrderInquiry(
  id: string,
  action: "claim" | "resolve" | "reopen",
  note?: string,
) {
  const { data, error } = await supabase.rpc(
    "customer_service_order_inquiry_update",
    { p_id: id, p_action: action, p_note: note?.trim() || null },
  );
  if (error) throw error;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(FOLLOW_UP_COUNTS_CHANGED));
  }
  return String(data || "");
}
