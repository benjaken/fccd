import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PaymentsListPage } from "@/components/PaymentsListPage";
import i18n from "@/i18n";
import type { PaymentListItem } from "@/lib/payments";
import { selectDate, selectDateRange } from "./calendar-test-helpers";

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

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
}

describe("PaymentsListPage", () => {
  beforeEach(async () => {
    mockMatchMedia(false);
    await i18n.changeLanguage("en");
  });

  it("moves mobile filters into a side panel and appends the next card page", async () => {
    mockMatchMedia(true);
    let notifyIntersection: IntersectionObserverCallback = () => undefined;
    const observe = vi.fn();
    vi.stubGlobal("IntersectionObserver", class IntersectionObserverMock {
      constructor(callback: IntersectionObserverCallback) { notifyIntersection = callback; }
      observe = observe; disconnect = vi.fn(); unobserve = vi.fn(); takeRecords = vi.fn(() => []);
      root = null; rootMargin = "180px 0px"; thresholds = [0];
    });
    const loadPayments = vi.fn().mockImplementation(async ({ page }: { page: number }) => ({
      total: 2,
      items: page === 1 ? [payments[0]] : [payments[1]],
    }));
    const user = userEvent.setup();

    render(<MemoryRouter><PaymentsListPage canViewFinance loadPayments={loadPayments} loadPaymentFilterOptions={async () => filterOptions} /></MemoryRouter>);

    const mobileList = await waitFor(() => {
      const node = document.querySelector<HTMLElement>(".payments-mobile-list");
      expect(node).toBeInTheDocument();
      return node!;
    });
    expect(within(mobileList).getByText("B-1001")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Brand" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open filters" }));
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Brand" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(observe).toHaveBeenCalled());
    act(() => notifyIntersection([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(await within(mobileList).findByText("B-1002")).toBeInTheDocument();
    expect(loadPayments).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    vi.unstubAllGlobals();
  });

  it("filters unreconciled payments by either one date or a date range", async () => {
    const loadPayments = vi.fn().mockResolvedValue({ items: payments, total: 3 });
    const user = userEvent.setup();
    render(<MemoryRouter><PaymentsListPage canViewFinance loadPayments={loadPayments} loadPaymentFilterOptions={async () => filterOptions} /></MemoryRouter>);

    await screen.findByText("B-1001");
    await selectDate(
      user,
      screen.getByRole("combobox", { name: "Payment date" }),
      "2026-08-20",
    );
    await waitFor(() => expect(loadPayments).toHaveBeenLastCalledWith(expect.objectContaining({ unreconciled: true, paymentDate: "2026-08-20" })));

    const dateFilter = screen.getByRole("combobox", { name: "Payment date filter" });
    expect(dateFilter).toHaveValue("single");
    await user.selectOptions(dateFilter, "range");
    const paymentDateRange = screen.getByRole("group", {
      name: "Payment date range",
    });
    await selectDateRange(
      user,
      paymentDateRange.querySelector("button")!,
      "2026-08-20",
      "2026-08-22",
    );
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

  it("searches by order number and filters the payment amount range", async () => {
    const loadPayments = vi.fn().mockResolvedValue({ items: payments, total: 3 });
    const user = userEvent.setup();
    render(<MemoryRouter><PaymentsListPage canViewFinance loadPayments={loadPayments} loadPaymentFilterOptions={async () => filterOptions} /></MemoryRouter>);

    await screen.findByText("B-1001");
    await user.type(screen.getByRole("searchbox", { name: "Search order number" }), "B-1001");
    await user.type(screen.getByRole("spinbutton", { name: "Minimum amount" }), "100");
    await user.type(screen.getByRole("spinbutton", { name: "Maximum amount" }), "200");

    await waitFor(() => expect(loadPayments).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1,
      unreconciled: true,
      search: "B-1001",
      amountMin: 100,
      amountMax: 200,
    })));
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
    expect(
      screen.getByRole("link", { name: "Open order B-1001" }).closest("td"),
    ).toHaveClass("table-actions-cell");
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
    await selectDate(
      user,
      within(dialog).getByRole("combobox", { name: "Payout date" }),
      "2026-08-20",
    );
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
