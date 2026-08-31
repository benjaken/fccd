import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrderReconciliationSummary } from "@/components/OrderReconciliationSummary";
import { fetchOrderReconciliationSummary } from "@/lib/order-reconciliation";

vi.mock("@/lib/order-reconciliation", async () => {
  const actual = await vi.importActual<typeof import("@/lib/order-reconciliation")>(
    "@/lib/order-reconciliation",
  );
  return { ...actual, fetchOrderReconciliationSummary: vi.fn() };
});

describe("OrderReconciliationSummary", () => {
  beforeEach(() => {
    vi.mocked(fetchOrderReconciliationSummary).mockResolvedValue({
      run: {
        runDate: "2026-08-31",
        scopeStart: "2026-07-31",
        shopifyCount: 43,
        fccdMatchedCount: 42,
        missingFccdCount: 1,
        unlinkedFccdCount: 0,
        factoryUnsentCount: 2,
        urgentCount: 1,
      },
      issues: [{
        id: "issue-1",
        issueType: "factory_unsent",
        severity: "urgent",
        serviceAt: "2026-08-31T07:00:00.000Z",
        orderId: "order-1",
        orderNumber: "B-1234",
        customerName: "ABC Company",
        storeDomain: "example.myshopify.com",
      }],
    });
  });

  it("shows the rolling comparison counts and actionable issues", async () => {
    render(<MemoryRouter><OrderReconciliationSummary /></MemoryRouter>);

    expect(await screen.findByText("43")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("B-1234")).toBeInTheDocument();
    expect(screen.getByText(/2026-07-31/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /B-1234/ })).toHaveAttribute("href", "/orders/order-1");
  });
});
