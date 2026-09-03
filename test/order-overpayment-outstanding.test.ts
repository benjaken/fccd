import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  orderPaymentStatus,
  paymentBalanceSummary,
  paymentOutstanding,
} from "@/lib/order-payment-balance";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903093000_allow_negative_outstanding_for_overpayments.sql",
  ),
  "utf8",
);

describe("overpayment outstanding", () => {
  it("keeps a signed remainder so overpayments are visible", () => {
    expect(paymentOutstanding(2876, 2916)).toBe(-40);
    expect(paymentBalanceSummary(2876, 2916)).toMatchObject({
      outstanding: -40,
      overpaid: 40,
      status: "overpaid",
      balanceKind: "overpaid",
      balanceAmount: 40,
    });
    expect(orderPaymentStatus({ total: 2876, paid: 2916, outstanding: -40 })).toBe("overpaid");
    expect(orderPaymentStatus({ total: 2876, paid: 2876, outstanding: 0 })).toBe("paid");
  });

  it("lets the database store a negative balance after an office edit", () => {
    expect(migration).toContain("least(");
    expect(migration).toContain("then least(");
    expect(migration).not.toMatch(/else\s+greatest\(/);
    expect(migration).toMatch(/\) - case\s+when o\.document_type = 'order' then/);
    expect(migration).toContain("orders.outstanding > private.order_outstanding_from_payments");
  });
});
