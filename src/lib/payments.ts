import { supabase } from "@/lib/supabase";

export const PAYMENTS_PAGE_SIZE = 15;

export type PaymentListItem = {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  amount: number;
  currency: string;
  paymentAt: string | null;
  payoutAt: string | null;
  reference: string | null;
};

export async function fetchPayments({
  page,
  search,
}: {
  page: number;
  search: string;
}) {
  const start = (page - 1) * PAYMENTS_PAGE_SIZE;
  const end = start + PAYMENTS_PAGE_SIZE - 1;
  let query = supabase
    .from("payments")
    .select(
      "id,order_id,order_number_snapshot,amount,currency,payment_at,payout_at,paypal_reference,receipt_reference",
      { count: "exact" },
    )
    .is("voided_at", null)
    // Bubble Created Date (payment_at remains a display field).
    .order("bubble_created_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(start, end);

  const term = search.replace(/[^\p{L}\p{N}\s@._+\-#]/gu, " ").trim();
  if (term) {
    query = query.or(
      `order_number_snapshot.ilike.%${term}%,paypal_reference.ilike.%${term}%,receipt_reference.ilike.%${term}%`,
    );
  }

  const { data, count, error } = await query;
  if (error) throw error;
  return {
    total: count ?? 0,
    items: (data ?? []).map((row) => ({
      id: row.id,
      orderId: row.order_id,
      orderNumber: row.order_number_snapshot,
      amount: Number(row.amount),
      currency: row.currency,
      paymentAt: row.payment_at,
      payoutAt: row.payout_at,
      reference: row.receipt_reference || row.paypal_reference,
    })) satisfies PaymentListItem[],
  };
}
