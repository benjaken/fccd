import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MasoftInvoiceReceiptsPage } from "@/components/MasoftInvoiceReceiptsPage";
import i18n from "@/i18n";
import { resolveMasoftMonthKey, type MasoftSettlement } from "@/lib/masoft-invoice-receipts";

const settlement: MasoftSettlement = {
  id: "settlement-1",
  invoiceNumber: "INV-1001",
  receiptNumber: "REC-1001",
  channelId: "channel-1",
  channelName: "Lunchbox",
  paymentMethodId: "method-1",
  paymentMethodName: "PayPal",
  payoutAt: "2026-08-20T00:00:00+08:00",
  grossAmount: 120,
  charges: 5,
  netAmount: 115,
  payments: [{ id: "payment-1", orderId: "order-1", orderNumber: "B-1001", amount: 120, currency: "HKD", paymentAt: "2026-08-19T00:00:00+08:00" }],
};

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
}

describe("resolveMasoftMonthKey", () => {
  it("uses the payout filter month, otherwise today's Hong Kong month", () => {
    expect(resolveMasoftMonthKey({ dateMode: "range", payoutDateStart: "2026-08-01", payoutDateEnd: "2026-08-31" })).toBe("2026-08");
    expect(resolveMasoftMonthKey({ dateMode: "single", payoutDate: "2026-07-15" })).toBe("2026-07");
    expect(resolveMasoftMonthKey({
      dateMode: "single",
      payoutDate: "",
      now: new Date("2026-09-11T06:00:00.000Z"),
    })).toBe("2026-09");
  });
});

describe("MasoftInvoiceReceiptsPage", () => {
  beforeEach(async () => {
    mockMatchMedia(false);
    await i18n.changeLanguage("en");
  });

  it("uses a mobile filter drawer and appends the next receipt card page", async () => {
    mockMatchMedia(true);
    let notifyIntersection: IntersectionObserverCallback = () => undefined;
    const observe = vi.fn();
    vi.stubGlobal("IntersectionObserver", class IntersectionObserverMock {
      constructor(callback: IntersectionObserverCallback) { notifyIntersection = callback; }
      observe = observe; disconnect = vi.fn(); unobserve = vi.fn(); takeRecords = vi.fn(() => []);
      root = null; rootMargin = "180px 0px"; thresholds = [0];
    });
    const loadSettlements = vi.fn().mockImplementation(async ({ page }: { page: number }) => ({
      total: 2,
      items: page === 1 ? [settlement] : [{ ...settlement, id: "settlement-2", invoiceNumber: "INV-1002", receiptNumber: "REC-1002" }],
    }));
    const user = userEvent.setup();

    render(<MemoryRouter><MasoftInvoiceReceiptsPage canViewFinance loadSettlements={loadSettlements} loadFilterOptions={async () => ({ channels: [], paymentMethods: [] })} loadMonthTotals={async () => ({ monthKey: "2026-09", grossAmount: 0, netAmount: 0 })} /></MemoryRouter>);

    const mobileList = await waitFor(() => {
      const node = document.querySelector<HTMLElement>(".masoft-mobile-list");
      expect(node).toBeInTheDocument();
      return node!;
    });
    expect(within(mobileList).getByText("INV-1001")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Brand" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open filters" }));
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Brand" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(observe).toHaveBeenCalled());
    act(() => notifyIntersection([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(await within(mobileList).findByText("INV-1002")).toBeInTheDocument();
    expect(loadSettlements).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    vi.unstubAllGlobals();
  });

  it("searches by order number and filters the payment amount range", async () => {
    const loadSettlements = vi.fn().mockResolvedValue({ total: 1, items: [settlement] });
    const user = userEvent.setup();

    render(<MemoryRouter><MasoftInvoiceReceiptsPage canViewFinance loadSettlements={loadSettlements} loadFilterOptions={async () => ({ channels: [], paymentMethods: [] })} loadMonthTotals={async () => ({ monthKey: "2026-09", grossAmount: 0, netAmount: 0 })} /></MemoryRouter>);

    await screen.findByText("INV-1001");
    await user.type(screen.getByRole("searchbox", { name: "Search order number" }), "B-1001");
    await user.type(screen.getByRole("textbox", { name: "Exact amount" }), "100");

    await waitFor(() => expect(loadSettlements).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1,
      orderNumber: "B-1001",
      amountMin: 100,
      amountMax: 100,
    })));
  });

  it("shows a direct delete action for an unverified receipt without a chevron action", async () => {
    const pending = { ...settlement, payments: [{ ...settlement.payments[0], orderId: null }] };
    const deleteSettlement = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<MemoryRouter><MasoftInvoiceReceiptsPage canViewFinance loadSettlements={async () => ({ total: 1, items: [pending] })} loadFilterOptions={async () => ({ channels: [], paymentMethods: [] })} loadMonthTotals={async () => ({ monthKey: "2026-09", grossAmount: 0, netAmount: 0 })} deleteSettlement={deleteSettlement} /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteSettlement).toHaveBeenCalledWith("settlement-1"));
    expect(screen.queryByRole("button", { name: /open/i })).not.toBeInTheDocument();
  });

  it("shows payment amount column and monthly all-brand totals with selection payment amount", async () => {
    const expectedMonth = resolveMasoftMonthKey({ dateMode: "single", payoutDate: "", now: new Date() });
    const loadMonthTotals = vi.fn().mockImplementation(async (monthKey: string) => ({
      monthKey,
      grossAmount: 93556.75,
      netAmount: 92000,
    }));
    const user = userEvent.setup();

    render(<MemoryRouter><MasoftInvoiceReceiptsPage
      canViewFinance
      loadSettlements={async () => ({ total: 1, items: [settlement] })}
      loadFilterOptions={async () => ({ channels: [], paymentMethods: [] })}
      loadMonthTotals={loadMonthTotals}
    /></MemoryRouter>);

    await screen.findByText("INV-1001");
    expect(screen.getByText("Payment amount", { selector: "th" })).toBeInTheDocument();
    expect(screen.getByText("Net received", { selector: "th" })).toBeInTheDocument();
    await waitFor(() => expect(loadMonthTotals).toHaveBeenCalledWith(expectedMonth));
    const monthTotals = await screen.findByTestId("masoft-month-totals");
    expect(monthTotals).toHaveTextContent("All brands this month");
    expect(monthTotals).toHaveTextContent("Month");
    expect(monthTotals).toHaveTextContent(expectedMonth);
    expect(monthTotals).toHaveTextContent("Payment amount");
    expect(monthTotals).toHaveTextContent("Net received");
    expect(monthTotals).toHaveTextContent("HK$93,556.75");
    expect(monthTotals).toHaveTextContent("HK$92,000.00");

    await user.click(screen.getByRole("checkbox", { name: "Select receipt INV-1001" }));
    expect(screen.getByText(/1 receipt\(s\) selected/)).toHaveTextContent("Payment amount");
    expect(screen.getByText(/1 receipt\(s\) selected/)).toHaveTextContent("HK$120.00");
    expect(screen.getByText(/1 receipt\(s\) selected/)).toHaveTextContent("HK$115.00");
  });
});
