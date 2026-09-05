import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  OfficeShopRequestsPage,
  OfficeShopReviewPage,
} from "@/components/OfficeShopOrderingPages";
import i18n from "@/i18n";
import * as shopOrders from "@/lib/shop-orders";

vi.mock("@/auth/use-page-access", () => ({
  useCurrentPageAccess: () => ({ canAccess: () => true }),
}));

vi.mock("@/lib/shop-orders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/shop-orders")>("@/lib/shop-orders");
  return {
    ...actual,
    fetchShopOrderRequests: vi.fn(),
    fetchShopCatalog: vi.fn(),
    fetchShopOrderEvents: vi.fn(),
    reviewShopOrder: vi.fn(),
    sendShopOrderToFactory: vi.fn(),
  };
});

const request: shopOrders.ShopOrderRequest = {
  id: "request-1",
  requestNo: "SO-20260905-0001",
  restaurantId: "restaurant-1",
  restaurantName: "TKO Shop",
  channel: "fc_internal",
  supplierId: "supplier-1",
  catalogSupplierName: "FC Frozen",
  deliveryDate: "2026-09-06",
  status: "submitted",
  note: null,
  contactPhone: null,
  whatsappCallStatus: null,
  whatsappCalledAt: null,
  createdAt: "2026-09-05T02:00:00Z",
  lines: [{
    id: "line-1",
    catalogItemId: "product-1",
    name: "Beef slices",
    unit: "2kg / pack",
    sku: "FCR001",
    quantity: 1,
    warehouse: "frozen",
  }],
};

function renderReview(initialEntry = "/restaurant/ordering/review") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/restaurant/ordering/review" element={<OfficeShopReviewPage />} />
        <Route path="/restaurant/ordering/review/:requestId" element={<OfficeShopReviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OfficeShopReviewPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    vi.mocked(shopOrders.fetchShopOrderRequests).mockResolvedValue([request]);
    vi.mocked(shopOrders.fetchShopCatalog).mockResolvedValue([
      {
        id: "product-1",
        sku: "FCR001",
        name: "Beef slices",
        unit: "2kg / pack",
        supplierName: "FC Frozen",
        channel: "fc_internal",
        warehouse: "frozen",
        fccSupplierId: "supplier-1",
        sortOrder: 1,
      },
      {
        id: "product-2",
        sku: "FCR002",
        name: "Beef brisket",
        unit: "2kg / pack",
        supplierName: "FC Frozen",
        channel: "fc_internal",
        warehouse: "frozen",
        fccSupplierId: "supplier-1",
        sortOrder: 2,
      },
    ]);
    vi.mocked(shopOrders.fetchShopOrderEvents).mockResolvedValue([]);
    vi.mocked(shopOrders.reviewShopOrder).mockResolvedValue(undefined);
  });

  it("opens a full-page editor, adds a product, and approves the complete order", async () => {
    const user = userEvent.setup();
    renderReview();

    await user.click(await screen.findByRole("button", { name: "Open review" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: request.requestNo })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Order details" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Step 2.*Order items/ }));
    expect(screen.getByRole("heading", { name: "Order items" })).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Add product" }));
    await user.click(screen.getByRole("option", { name: /Beef brisket/ }));
    await user.click(screen.getByRole("button", { name: "Add product" }));
    expect(screen.getByText("Beef brisket")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Step 3.*Review decision/ }));
    await user.type(screen.getByPlaceholderText("For example: quantities and delivery date verified"), "Checked quantities");
    await user.click(screen.getByRole("button", { name: "Approve order" }));

    await waitFor(() => {
      expect(shopOrders.reviewShopOrder).toHaveBeenCalledWith(expect.objectContaining({
        requestId: "request-1",
        action: "approve",
        reviewNote: "Checked quantities",
        lines: [
          { catalogItemId: "product-1", quantity: 1 },
          { catalogItemId: "product-2", quantity: 1 },
        ],
      }));
    });
    expect(screen.getAllByText("Reviewed").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Send to factory" })).toBeInTheDocument();
  });

  it("requires a reason before returning an order", async () => {
    const user = userEvent.setup();
    renderReview();
    await user.click(await screen.findByRole("button", { name: "Open review" }));
    await screen.findByRole("heading", { name: request.requestNo });
    await user.click(screen.getByRole("button", { name: "Return for changes" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a reason before returning the order.");
    expect(shopOrders.reviewShopOrder).not.toHaveBeenCalled();
  });

  it("opens an order request in the same full-page workspace", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/restaurant/ordering/requests"]}>
        <Routes>
          <Route path="/restaurant/ordering/requests" element={<OfficeShopRequestsPage />} />
          <Route path="/restaurant/ordering/review/:requestId" element={<OfficeShopReviewPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "View details" }));

    expect(
      await screen.findByRole("heading", { name: request.requestNo }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(shopOrders.fetchShopOrderRequests).toHaveBeenCalledWith({
      requestId: request.id,
    });
  });
});
