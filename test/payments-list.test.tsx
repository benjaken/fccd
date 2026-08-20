import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PaymentsListPage } from "@/components/PaymentsListPage";
import i18n from "@/i18n";
import type { PaymentListItem } from "@/lib/payments";

const payments: PaymentListItem[] = [
  {
    id: "payment-1", orderId: "order-1", orderNumber: "B-1001",
    channelId: "channel-1", channelName: "Lunchbox",
    paymentMethodId: "method-1", paymentMethodName: "PayPal",
    amount: 120, currency: "HKD", paymentAt: "2026-08-20T03:00:00+08:00", payoutAt: null, reference: "ref-1",
  },
  {
    id: "payment-2", orderId: "order-2", orderNumber: "B-1002",
    channelId: "channel-1", channelName: "Lunchbox",
    paymentMethodId: "method-1", paymentMethodName: "PayPal",
    amount: 80, currency: "HKD", paymentAt: "2026-08-21T03:00:00+08:00", payoutAt: null, reference: "ref-2",
  },
  {
    id: "payment-3", orderId: "order-3", orderNumber: "B-1003",
    channelId: "channel-2", channelName: "Catering",
    paymentMethodId: "method-1", paymentMethodName: "PayPal",
    amount: 50, currency: "HKD", paymentAt: "2026-08-22T03:00:00+08:00", payoutAt: null, reference: "ref-3",
  },
];

const filterOptions = {
  channels: [{ id: "channel-1", name: "Lunchbox" }, { id: "channel-2", name: "Catering" }],
  paymentMethods: [{ id: "method-1", name: "PayPal" }],
};

describe("PaymentsListPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("filters unreconciled payments by either one date or a date range", async () => {
    const loadPayments = vi.fn().mockResolvedValue({ items: payments, total: 3 });
    const user = userEvent.setup();
    render(<MemoryRouter><PaymentsListPage canViewFinance loadPayments={loadPayments} loadPaymentFilterOptions={async () => filterOptions} /></MemoryRouter>);

    await screen.findByText("B-1001");
    await user.type(screen.getByLabelText("Payment date"), "2026-08-20");
    await waitFor(() => expect(loadPayments).toHaveBeenLastCalledWith(expect.objectContaining({ unreconciled: true, paymentDate: "2026-08-20" })));

    const dateFilter = screen.getByRole("combobox", { name: "Payment date filter" });
    expect(dateFilter).toHaveValue("single");
    await user.selectOptions(dateFilter, "range");
    await user.type(screen.getByLabelText("From"), "2026-08-20");
    await user.type(screen.getByLabelText("To"), "2026-08-22");
    await waitFor(() => expect(loadPayments).toHaveBeenLastCalledWith(expect.objectContaining({ unreconciled: true, paymentDate: null, paymentDateStart: "2026-08-20", paymentDateEnd: "2026-08-22" })));
  });

  it("filters payments by brand and payment method", async () => {
    const loadPayments = vi.fn().mockResolvedValue({ items: payments, total: 3 });
    const user = userEvent.setup();
    render(<MemoryRouter><PaymentsListPage canViewFinance loadPayments={loadPayments} loadPaymentFilterOptions={async () => filterOptions} /></MemoryRouter>);

    await screen.findByText("B-1001");
    await user.selectOptions(screen.getByRole("combobox", { name: "Brand" }), "channel-2");
    await waitFor(() => expect(loadPayments).toHaveBeenLastCalledWith(expect.objectContaining({ channelId: "channel-2", paymentMethodId: null })));

    await user.selectOptions(screen.getByRole("combobox", { name: "Payment method" }), "method-1");
    await waitFor(() => expect(loadPayments).toHaveBeenLastCalledWith(expect.objectContaining({ channelId: "channel-2", paymentMethodId: "method-1" })));
  });

  it("only offers management for a compatible brand and payment method", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><PaymentsListPage canViewFinance loadPayments={async () => ({ items: payments, total: 3 })} loadPaymentFilterOptions={async () => filterOptions} /></MemoryRouter>);

    await user.click(await screen.findByLabelText("Select payment B-1001"));
    expect(screen.getByText("1 payment record(s) selected · Total $120.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage" })).toBeInTheDocument();
    await user.click(screen.getByLabelText("Select payment B-1003"));
    expect(screen.getByText("You cannot manage more than one brand or payment method at a time.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
  });

  it("puts brand, order number, payment method, payment date, and amount after selection", async () => {
    render(<MemoryRouter><PaymentsListPage canViewFinance loadPayments={async () => ({ items: payments, total: 3 })} loadPaymentFilterOptions={async () => filterOptions} /></MemoryRouter>);

    const headers = (await screen.findAllByRole("columnheader")).map((header) => header.textContent);
    expect(headers.slice(1, 6)).toEqual(["Brand", "Order", "Payment method", "Payment date", "Amount"]);
  });

  it("prevents a negative net amount and reconciles compatible selections", async () => {
    const user = userEvent.setup();
    const saveSettlement = vi.fn().mockResolvedValue(undefined);
    render(<MemoryRouter><PaymentsListPage canViewFinance loadPayments={async () => ({ items: payments.slice(0, 2), total: 2 })} loadPaymentFilterOptions={async () => filterOptions} saveSettlement={saveSettlement} /></MemoryRouter>);

    await user.click(await screen.findByLabelText("Select all payments on this page"));
    await user.click(screen.getByRole("button", { name: "Manage" }));
    const dialog = screen.getByRole("dialog", { name: "Manage payment reconciliation" });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    const charges = within(dialog).getByLabelText("Charges");
    await user.type(charges, "201");
    expect(within(dialog).getByText("Net received cannot be below 0, and charges must be a valid non-negative amount.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Confirm reconciliation" })).toBeDisabled();

    await user.clear(charges);
    await user.type(charges, "20");
    const payoutDate = within(dialog).getByLabelText("Payout date");
    await user.clear(payoutDate);
    await user.type(payoutDate, "2026-08-20");
    await user.click(within(dialog).getByRole("button", { name: "Confirm reconciliation" }));
    await waitFor(() => expect(saveSettlement).toHaveBeenCalledWith({ paymentIds: ["payment-1", "payment-2"], payoutDateMode: "custom", payoutAt: expect.any(String), charges: 20 }));
  });

  it("uses payment dates with zero charges when selected", async () => {
    const user = userEvent.setup();
    const saveSettlement = vi.fn().mockResolvedValue(undefined);
    render(<MemoryRouter><PaymentsListPage canViewFinance loadPayments={async () => ({ items: payments.slice(0, 2), total: 2 })} loadPaymentFilterOptions={async () => filterOptions} saveSettlement={saveSettlement} /></MemoryRouter>);

    await user.click(await screen.findByLabelText("Select payment B-1001"));
    await user.click(screen.getByRole("button", { name: "Manage" }));
    const dialog = screen.getByRole("dialog", { name: "Manage payment reconciliation" });
    await user.type(within(dialog).getByLabelText("Charges"), "20");
    await user.click(within(dialog).getByLabelText("Payment date"));
    expect(within(dialog).queryByLabelText("Charges")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Charges").parentElement).toHaveTextContent("HK$0.00");
    expect(within(dialog).getByText("Net received").parentElement).toHaveTextContent("HK$120.00");
    await user.click(within(dialog).getByRole("button", { name: "Confirm reconciliation" }));
    await waitFor(() => expect(saveSettlement).toHaveBeenCalledWith({ paymentIds: ["payment-1"], payoutDateMode: "payment", payoutAt: null, charges: 0 }));
  });
});
