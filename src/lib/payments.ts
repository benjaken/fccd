import { supabase } from "@/lib/supabase";

export const PAYMENTS_PAGE_SIZE = 15;

export type PaymentListItem = {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  channelId: string | null;
  channelName: string | null;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
  amount: number;
  currency: string;
  paymentAt: string | null;
  payoutAt: string | null;
  reference: string | null;
};

export type PaymentListFilters = {
  page: number;
  /** Retained for the data-input progress panel. The reconciliation page does not use it. */
  search?: string;
  /** Retained for the data-input progress panel. The reconciliation page does not use it. */
  month?: string | null;
  pageSize?: number;
  paymentDate?: string | null;
  paymentDateStart?: string | null;
  paymentDateEnd?: string | null;
  channelId?: string | null;
  paymentMethodId?: string | null;
  /** Limits results to payments with no settlement relation. */
  unreconciled?: boolean;
};

export type PaymentFilterOption = {
  id: string;
  name: string;
};

export type PaymentFilterOptions = {
  channels: PaymentFilterOption[];
  paymentMethods: PaymentFilterOption[];
};

export type PaymentSettlementInput = {
  paymentIds: string[];
  payoutDateMode: "custom" | "payment";
  payoutAt?: string | null;
  charges: number;
};

function dayStart(day: string) {
  return `${day}T00:00:00+08:00`;
}

function nextDay(day: string) {
  const value = new Date(`${day}T12:00:00+08:00`);
  value.setDate(value.getDate() + 1);
  return dayStart(value.toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" }));
}

export async function fetchPayments({
  page,
  search = "",
  month,
  pageSize = PAYMENTS_PAGE_SIZE,
  paymentDate,
  paymentDateStart,
  paymentDateEnd,
  channelId,
  paymentMethodId,
  unreconciled = false,
}: PaymentListFilters) {
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;
  let query = supabase
    .from("payments")
    .select(
      "id,order_id,order_number_snapshot,channel_id,payment_method_id,amount,currency,payment_at,payout_at,paypal_reference,receipt_reference,channels(name),payment_methods(name),payment_settlement_payments!left(payment_id)",
      { count: "exact" },
    )
    .is("voided_at", null)
    .order("payment_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(start, end);

  if (unreconciled) query = query.is("payment_settlement_payments", null);
  if (channelId) query = query.eq("channel_id", channelId);
  if (paymentMethodId) query = query.eq("payment_method_id", paymentMethodId);

  const term = search.replace(/[^\p{L}\p{N}\s@._+\-#]/gu, " ").trim();
  if (term) {
    query = query.or(
      `order_number_snapshot.ilike.%${term}%,paypal_reference.ilike.%${term}%,receipt_reference.ilike.%${term}%`,
    );
  }
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, monthNumber] = month.split("-").map(Number);
    const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 7);
    query = query.gte("payment_at", dayStart(`${month}-01`)).lt("payment_at", dayStart(`${nextMonth}-01`));
  }
  if (paymentDate && /^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    query = query.gte("payment_at", dayStart(paymentDate)).lt("payment_at", nextDay(paymentDate));
  } else {
    if (paymentDateStart && /^\d{4}-\d{2}-\d{2}$/.test(paymentDateStart)) {
      query = query.gte("payment_at", dayStart(paymentDateStart));
    }
    if (paymentDateEnd && /^\d{4}-\d{2}-\d{2}$/.test(paymentDateEnd)) {
      query = query.lt("payment_at", nextDay(paymentDateEnd));
    }
  }

  const { data, count, error } = await query;
  if (error) throw error;
  return {
    total: count ?? 0,
    items: (data ?? []).map((row) => {
      const channel = row.channels as { name: string } | { name: string }[] | null;
      const paymentMethod = row.payment_methods as { name: string } | { name: string }[] | null;
      return {
        id: row.id,
        orderId: row.order_id,
        orderNumber: row.order_number_snapshot,
        channelId: row.channel_id,
        channelName: Array.isArray(channel) ? channel[0]?.name ?? null : channel?.name ?? null,
        paymentMethodId: row.payment_method_id,
        paymentMethodName: Array.isArray(paymentMethod) ? paymentMethod[0]?.name ?? null : paymentMethod?.name ?? null,
        amount: Number(row.amount),
        currency: row.currency,
        paymentAt: row.payment_at,
        payoutAt: row.payout_at,
        reference: row.receipt_reference || row.paypal_reference,
      };
    }) satisfies PaymentListItem[],
  };
}

export async function fetchPaymentFilterOptions(): Promise<PaymentFilterOptions> {
  const [channelsResult, paymentMethodsResult] = await Promise.all([
    supabase
      .from("channels")
      .select("id,name")
      .is("archived_at", null)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true }),
    supabase
      .from("payment_methods")
      .select("id,name")
      .is("archived_at", null)
      .order("name", { ascending: true }),
  ]);
  if (channelsResult.error) throw channelsResult.error;
  if (paymentMethodsResult.error) throw paymentMethodsResult.error;
  return {
    channels: (channelsResult.data ?? []) as PaymentFilterOption[],
    paymentMethods: (paymentMethodsResult.data ?? []) as PaymentFilterOption[],
  };
}

export async function settlePayments(input: PaymentSettlementInput): Promise<void> {
  const paymentIds = [...new Set(input.paymentIds.filter(Boolean))];
  if (!paymentIds.length) throw new Error("payments_required");
  if (!Number.isFinite(input.charges) || input.charges < 0) {
    throw new Error("invalid_charges");
  }
  if (input.payoutDateMode === "custom" && !/^\d{4}-\d{2}-\d{2}$/.test(input.payoutAt ?? "")) {
    throw new Error("payout_date_required");
  }

  const { error } = await supabase.rpc("reconcile_payment_settlement", {
    p_payment_ids: paymentIds,
    p_payout_date_mode: input.payoutDateMode,
    p_payout_at: input.payoutDateMode === "custom" ? input.payoutAt : null,
    p_charges: input.payoutDateMode === "custom" ? input.charges : 0,
  });
  if (error) throw error;
}
