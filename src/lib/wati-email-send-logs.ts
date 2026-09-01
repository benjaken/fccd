import { supabase } from "@/lib/supabase";

export const WATI_EMAIL_LOG_PAGE_SIZE = 15;

export type WatiEmailLogChannel = "wati" | "email";

export type WatiEmailSendLogItem = {
  id: string;
  sentAt: string;
  channel: WatiEmailLogChannel;
  eventKey: string;
  templateName: string | null;
  recipientName: string | null;
  recipientAddress: string | null;
  orderNumber: string | null;
  detail: Record<string, unknown>;
};

type SendLogRow = {
  log_id: string;
  sent_at: string;
  channel: WatiEmailLogChannel;
  event_key: string;
  template_name: string | null;
  recipient_name: string | null;
  recipient_address: string | null;
  order_number: string | null;
  detail: Record<string, unknown> | null;
  total_count: number | string;
};

export async function fetchWatiEmailSendLogs({
  page,
  search,
  channel,
}: {
  page: number;
  search: string;
  channel: "" | WatiEmailLogChannel;
}) {
  const { data, error } = await supabase.rpc("wati_email_send_log_list", {
    p_offset: (page - 1) * WATI_EMAIL_LOG_PAGE_SIZE,
    p_limit: WATI_EMAIL_LOG_PAGE_SIZE,
    p_search: search || null,
    p_channel: channel || null,
  });
  if (error) throw error;

  const rows = (data ?? []) as SendLogRow[];
  return {
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
    items: rows.map((row) => ({
      id: row.log_id,
      sentAt: row.sent_at,
      channel: row.channel,
      eventKey: row.event_key,
      templateName: row.template_name,
      recipientName: row.recipient_name,
      recipientAddress: row.recipient_address,
      orderNumber: row.order_number,
      detail: row.detail ?? {},
    })) satisfies WatiEmailSendLogItem[],
  };
}
