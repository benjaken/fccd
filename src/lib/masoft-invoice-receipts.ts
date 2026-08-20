import { supabase } from "@/lib/supabase";

export const MASOFT_PAGE_SIZE = 50;

export type MasoftPayment = {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  amount: number;
  currency: string;
  paymentAt: string | null;
};

export type MasoftSettlement = {
  id: string;
  invoiceNumber: string | null;
  receiptNumber: string | null;
  channelId: string | null;
  channelName: string | null;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
  payoutAt: string | null;
  grossAmount: number;
  charges: number;
  netAmount: number;
  payments: MasoftPayment[];
};

export type MasoftFilters = {
  page: number;
  payoutDate?: string | null;
  payoutDateStart?: string | null;
  payoutDateEnd?: string | null;
  channelId?: string | null;
  paymentMethodId?: string | null;
  payoutAscending?: boolean;
};

export type MasoftFilterOptions = { channels: Array<{ id: string; name: string }>; paymentMethods: Array<{ id: string; name: string }> };

function dayStart(day: string) { return `${day}T00:00:00+08:00`; }
function nextDay(day: string) {
  const value = new Date(`${day}T12:00:00+08:00`);
  value.setDate(value.getDate() + 1);
  return dayStart(value.toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" }));
}

function single<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] ?? null : value; }

export async function fetchMasoftSettlements(filters: MasoftFilters) {
  const start = (filters.page - 1) * MASOFT_PAGE_SIZE;
  let query = supabase
    .from("payment_settlements")
    .select("id,invoice_number,receipt_number,channel_id,payment_method_id,payout_at,gross_amount,charges,net_amount,channels(name),payment_methods(name),payment_settlement_payments(payment_id,payments(id,order_id,order_number_snapshot,amount,currency,payment_at,orders(order_number)))", { count: "exact" })
    .order("payout_at", { ascending: filters.payoutAscending ?? false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(start, start + MASOFT_PAGE_SIZE - 1);
  if (filters.channelId) query = query.eq("channel_id", filters.channelId);
  if (filters.paymentMethodId) query = query.eq("payment_method_id", filters.paymentMethodId);
  if (filters.payoutDate) query = query.gte("payout_at", dayStart(filters.payoutDate)).lt("payout_at", nextDay(filters.payoutDate));
  else {
    if (filters.payoutDateStart) query = query.gte("payout_at", dayStart(filters.payoutDateStart));
    if (filters.payoutDateEnd) query = query.lt("payout_at", nextDay(filters.payoutDateEnd));
  }
  const { data, count, error } = await query;
  if (error) throw error;
  return {
    total: count ?? 0,
    items: (data ?? []).map((row) => {
      const channel = single(row.channels as { name: string } | { name: string }[] | null);
      const method = single(row.payment_methods as { name: string } | { name: string }[] | null);
      const links = (row.payment_settlement_payments ?? []) as unknown as Array<{ payments: Array<{ id: string; order_id: string | null; order_number_snapshot: string | null; amount: number; currency: string; payment_at: string | null; orders: Array<{ order_number: string | null }> | null }> | null }>;
      return {
        id: row.id,
        invoiceNumber: row.invoice_number,
        receiptNumber: row.receipt_number,
        channelId: row.channel_id,
        channelName: channel?.name ?? null,
        paymentMethodId: row.payment_method_id,
        paymentMethodName: method?.name ?? null,
        payoutAt: row.payout_at,
        grossAmount: Number(row.gross_amount ?? 0),
        charges: Number(row.charges ?? 0),
        netAmount: Number(row.net_amount ?? 0),
        payments: links.map((link) => single(link.payments)).filter(Boolean).map((payment) => ({ id: payment!.id, orderId: payment!.order_id, orderNumber: payment!.order_number_snapshot || single(payment!.orders)?.order_number || null, amount: Number(payment!.amount), currency: payment!.currency, paymentAt: payment!.payment_at })),
      } satisfies MasoftSettlement;
    }),
  };
}

export async function fetchMasoftFilterOptions(): Promise<MasoftFilterOptions> {
  const [channels, paymentMethods] = await Promise.all([
    supabase.from("channels").select("id,name").is("archived_at", null).order("sort_order").order("name"),
    supabase.from("payment_methods").select("id,name").is("archived_at", null).order("name"),
  ]);
  if (channels.error) throw channels.error;
  if (paymentMethods.error) throw paymentMethods.error;
  return { channels: channels.data ?? [], paymentMethods: paymentMethods.data ?? [] };
}

export async function fetchSettlementPaymentCandidates(settlement: MasoftSettlement): Promise<MasoftPayment[]> {
  if (!settlement.channelId || !settlement.paymentMethodId) return settlement.payments;
  const { data, error } = await supabase
    .from("payments")
    .select("id,order_id,order_number_snapshot,amount,currency,payment_at,payment_settlement_payments!left(payment_id)")
    .eq("channel_id", settlement.channelId)
    .eq("payment_method_id", settlement.paymentMethodId)
    .is("voided_at", null)
    .is("payment_settlement_payments", null)
    .order("payment_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const candidates = (data ?? []).map((row) => ({ id: row.id, orderId: row.order_id, orderNumber: row.order_number_snapshot, amount: Number(row.amount), currency: row.currency, paymentAt: row.payment_at }));
  const known = new Set(candidates.map((payment) => payment.id));
  return [...settlement.payments, ...candidates.filter((payment) => !known.has(payment.id))];
}

export async function updateMasoftSettlement(input: { settlementId: string; invoiceNumber: string; receiptNumber: string; payoutAt: string; charges: number; paymentIds: string[]; preservePaymentAmount?: boolean }) {
  if (!input.paymentIds.length || !/^\d{4}-\d{2}-\d{2}$/.test(input.payoutAt) || !Number.isFinite(input.charges) || input.charges < 0) throw new Error("invalid_settlement");
  const { error } = await supabase.rpc("update_payment_settlement", {
    p_settlement_id: input.settlementId,
    p_invoice_number: input.invoiceNumber.trim() || null,
    p_receipt_number: input.receiptNumber.trim() || null,
    p_payout_at: input.payoutAt,
    p_charges: input.charges,
    p_payment_ids: [...new Set(input.paymentIds)],
    p_preserve_payment_amount: Boolean(input.preservePaymentAmount),
  });
  if (error) throw error;
}

export async function assignMasoftInvoiceNumber(settlementIds: string[], invoiceNumber: string) {
  const ids = [...new Set(settlementIds.filter(Boolean))];
  if (!ids.length || !invoiceNumber.trim()) throw new Error("invoice_number_required");
  const { error } = await supabase.rpc("assign_payment_settlement_invoice", {
    p_settlement_ids: ids,
    p_invoice_number: invoiceNumber.trim(),
  });
  if (error) throw error;
}

export async function deleteMasoftSettlement(settlementId: string) {
  if (!settlementId) throw new Error("settlement_id_required");
  const { error } = await supabase.rpc("delete_payment_settlement", {
    p_settlement_id: settlementId,
  });
  if (error) throw error;
}
