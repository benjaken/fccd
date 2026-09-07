import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MasoftInvoiceReceiptsPage } from "@/components/MasoftInvoiceReceiptsPage";
import i18n from "@/i18n";
import type { MasoftSettlement } from "@/lib/masoft-invoice-receipts";

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

    render(<MemoryRouter><MasoftInvoiceReceiptsPage canViewFinance loadSettlements={loadSettlements} loadFilterOptions={async () => ({ channels: [], paymentMethods: [] })} /></MemoryRouter>);

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

    render(<MemoryRouter><MasoftInvoiceReceiptsPage canViewFinance loadSettlements={loadSettlements} loadFilterOptions={async () => ({ channels: [], paymentMethods: [] })} /></MemoryRouter>);

    await screen.findByText("INV-1001");
    await user.type(screen.getByRole("searchbox", { name: "Search order number" }), "B-1001");
    await user.type(screen.getByRole("spinbutton", { name: "Minimum amount" }), "100");
    await user.type(screen.getByRole("spinbutton", { name: "Maximum amount" }), "200");

    await waitFor(() => expect(loadSettlements).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1,
      orderNumber: "B-1001",
      amountMin: 100,
      amountMax: 200,
    })));
  });

  it("shows a direct delete action for an unverified receipt without a chevron action", async () => {
    const pending = { ...settlement, payments: [{ ...settlement.payments[0], orderId: null }] };
    const deleteSettlement = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<MemoryRouter><MasoftInvoiceReceiptsPage canViewFinance loadSettlements={async () => ({ total: 1, items: [pending] })} loadFilterOptions={async () => ({ channels: [], paymentMethods: [] })} deleteSettlement={deleteSettlement} /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteSettlement).toHaveBeenCalledWith("settlement-1"));
    expect(screen.queryByRole("button", { name: /open/i })).not.toBeInTheDocument();
  });
});
