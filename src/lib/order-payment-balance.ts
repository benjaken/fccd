export type OrderPaymentStatus = "unpaid" | "partial" | "paid" | "overpaid";

export function paymentOutstanding(total: number, paid: number) {
  return total - paid;
}

export function paymentOverpaid(total: number, paid: number) {
  return Math.max(0, paid - total);
}

export function orderPaymentStatus({
  total,
  paid,
  outstanding = paymentOutstanding(total, paid),
}: {
  total: number;
  paid: number;
  outstanding?: number;
}): OrderPaymentStatus {
  if (paid > total && paid > 0) return "overpaid";
  if (outstanding <= 0 && (total > 0 || paid > 0)) return "paid";
  if (paid > 0) return "partial";
  return "unpaid";
}

export function paymentBalanceSummary(total: number, paid: number) {
  const outstanding = paymentOutstanding(total, paid);
  const overpaid = paymentOverpaid(total, paid);
  return {
    outstanding,
    overpaid,
    status: orderPaymentStatus({ total, paid, outstanding }),
    balanceKind: overpaid > 0 ? ("overpaid" as const) : ("outstanding" as const),
    balanceAmount: overpaid > 0 ? overpaid : Math.max(0, outstanding),
  };
}
