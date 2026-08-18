import { describe, expect, it } from "vitest";
import {
  mapShopifyTransaction,
  orderNeedsTransactionSync,
  shopifyTransactionLegacyId,
} from "../supabase/functions/shopify-order-sync/map.ts";

const baseInput = {
  shopDomain: "test-store.myshopify.com",
  orderId: 4242,
  orderSupabaseId: "order-uuid",
  orderLegacyId: "shopify:test-store:4242",
  channelId: "channel-uuid",
  orderNumber: "#1001",
  orderCurrency: "HKD",
};

describe("shopify transaction mapping", () => {
  it("maps a successful sale transaction into a payments row", () => {
    const row = mapShopifyTransaction({
      ...baseInput,
      transaction: {
        id: 9001,
        kind: "sale",
        status: "success",
        amount: "1234.56",
        currency: "HKD",
        gateway: "shopify_payments",
        authorization: "auth-abc",
        created_at: "2026-08-01T12:00:00.000Z",
      },
    });

    expect(row).toBeTruthy();
    expect(row!.legacy_id).toBe(
      shopifyTransactionLegacyId(baseInput.shopDomain, 4242, 9001),
    );
    expect(row!.order_id).toBe("order-uuid");
    expect(row!.amount).toBe(1234.56);
    expect(row!.currency).toBe("HKD");
    expect(row!.payment_at).toBe("2026-08-01T12:00:00.000Z");
    expect(row!.voided_at).toBeNull();
  });

  it("skips authorization transactions (only sale/capture are payments)", () => {
    const row = mapShopifyTransaction({
      ...baseInput,
      transaction: {
        id: 9002,
        kind: "authorization",
        status: "success",
        amount: "100.00",
        currency: "HKD",
      },
    });
    expect(row).toBeNull();
  });

  it("skips failed transactions", () => {
    const row = mapShopifyTransaction({
      ...baseInput,
      transaction: {
        id: 9003,
        kind: "sale",
        status: "failure",
        amount: "100.00",
        currency: "HKD",
      },
    });
    expect(row).toBeNull();
  });

  it("skips zero or negative amounts", () => {
    for (const amount of ["0.00", "-5.00", "0"]) {
      const row = mapShopifyTransaction({
        ...baseInput,
        transaction: {
          id: 9004,
          kind: "sale",
          status: "success",
          amount,
          currency: "HKD",
        },
      });
      expect(row).toBeNull();
    }
  });

  it("maps capture and refund-like kinds correctly", () => {
    const capture = mapShopifyTransaction({
      ...baseInput,
      transaction: {
        id: 9005,
        kind: "capture",
        status: "success",
        amount: "50.00",
        currency: "HKD",
      },
    });
    expect(capture).toBeTruthy();
  });

  it("falls back to the order currency when transaction has none", () => {
    const row = mapShopifyTransaction({
      ...baseInput,
      transaction: {
        id: 9006,
        kind: "sale",
        status: "success",
        amount: "10.00",
        currency: null,
      },
    });
    expect(row!.currency).toBe("HKD");
  });

  it("stores paypal authorization in paypal_reference for paypal gateway", () => {
    const row = mapShopifyTransaction({
      ...baseInput,
      transaction: {
        id: 9007,
        kind: "sale",
        status: "success",
        amount: "20.00",
        currency: "HKD",
        gateway: "paypal",
        authorization: "PAY-123",
      },
    });
    expect(row!.paypal_reference).toBe("PAY-123");
  });
});

describe("orderNeedsTransactionSync", () => {
  it("returns false for unpaid (pending) orders", () => {
    expect(
      orderNeedsTransactionSync({ id: 1, financial_status: "pending" }),
    ).toBe(false);
  });

  it("returns true for paid and partially paid orders", () => {
    expect(
      orderNeedsTransactionSync({ id: 1, financial_status: "paid" }),
    ).toBe(true);
    expect(
      orderNeedsTransactionSync({ id: 1, financial_status: "partially_paid" }),
    ).toBe(true);
    expect(
      orderNeedsTransactionSync({ id: 1, financial_status: null }),
    ).toBe(true);
  });
});
