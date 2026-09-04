import { fireEvent, render, screen } from "@testing-library/react";
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
        deliveryAt: "2026-08-31T08:00:00.000Z",
        deliveryTime: "16:00 - 16:30",
        address: "九龍測試道 1 號",
        deliveryStatus: null,
        isSentToFactory: false,
        doNotSendToFactory: false,
      }],
      excludedOrders: [{
        orderId: "order-2",
        orderNumber: "B-1523",
        customerName: "Known Exception",
        storeDomain: "example.myshopify.com",
        deliveryAt: "2026-08-30T08:00:00.000Z",
        deliveryTime: "16:00",
        address: "香港測試街 2 號",
        deliveryStatus: "close",
        isSentToFactory: false,
        doNotSendToFactory: false,
        exclusionReasons: ["B-1523 已知例外", "已有營運狀態：close"],
      }],
    });
  });

  it("shows the rolling comparison counts and actionable issues", async () => {
    render(<MemoryRouter><OrderReconciliationSummary /></MemoryRouter>);

    const trigger = await screen.findByRole("button", { name: /漏單核對，1項未解決/ });
    expect(trigger).toHaveTextContent("1");
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: "Shopify與FCCD漏單核對" })).toBeInTheDocument();
    expect(await screen.findByText("43")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("B-1234")).toBeInTheDocument();
    expect(screen.getByText("B-1523")).toBeInTheDocument();
    expect(screen.getByText(/已排除，不計入漏單/)).toBeInTheDocument();
    expect(screen.getByText("B-1523 已知例外")).toHaveClass("order-reconciliation-reason-status");
    expect(screen.getByText("已有營運狀態：close")).toHaveClass("order-reconciliation-reason-status");
    expect(screen.getByText(/2026-07-31/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /B-1234/ })).toHaveAttribute("href", "/orders/order-1");
  });

  it("does not update state after unmount", async () => {
    let resolveSummary!: (value: Awaited<ReturnType<typeof fetchOrderReconciliationSummary>>) => void;
    vi.mocked(fetchOrderReconciliationSummary).mockImplementation(
      () => new Promise((resolve) => {
        resolveSummary = resolve;
      }),
    );

    const { unmount } = render(<MemoryRouter><OrderReconciliationSummary /></MemoryRouter>);
    unmount();
    resolveSummary({ run: null, issues: [], excludedOrders: [] });
    await Promise.resolve();
  });
});
