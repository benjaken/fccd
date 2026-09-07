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
    fetchShopDeliveryFormOptions: vi.fn(),
    createShopOrderRequest: vi.fn(),
    reviewShopOrder: vi.fn(),
    sendShopOrderToFactory: vi.fn(),
    updateShopOrderDeliveryDetails: vi.fn(),
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
  shippingMethodId: "method-1",
  shippingMethodName: "Factory delivery",
  deliveryContactPerson: "Restaurant contact",
  deliveryPhone: "61234567",
  deliveryAddress: "TKO delivery address",
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
    vi.mocked(shopOrders.fetchShopDeliveryFormOptions).mockResolvedValue({
      shippingMethods: [{ id: "method-1", name: "Factory delivery" }],
      profile: null,
    });
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
      {
        id: "product-3",
        sku: "FCD001",
        name: "Rice",
        unit: "bag",
        supplierName: "FC Dry Goods",
        channel: "fc_internal",
        warehouse: "dry",
        fccSupplierId: "supplier-2",
        sortOrder: 3,
      },
    ]);
    vi.mocked(shopOrders.fetchShopOrderEvents).mockResolvedValue([]);
    vi.mocked(shopOrders.reviewShopOrder).mockResolvedValue(undefined);
    vi.mocked(shopOrders.sendShopOrderToFactory).mockResolvedValue(undefined);
  });

  it("opens a full-page editor, adds a product, and approves the complete order", async () => {
    const user = userEvent.setup();
    renderReview();

    await user.click(await screen.findByRole("button", { name: "Open review" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: request.requestNo })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Order details" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Order items" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review decision" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Activity history" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Step 2.*Order items/ }));
    expect(screen.getByRole("button", { name: /Step 2.*Order items/ })).toHaveAttribute("aria-current", "location");

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
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("button", { name: "Send to factory" })).toBeInTheDocument();
  });

  it("requires a reason before returning an order", async () => {
    const user = userEvent.setup();
    renderReview();
    await user.click(await screen.findByRole("button", { name: "Open review" }));
    await screen.findByRole("heading", { name: request.requestNo });
    await user.click(screen.getByRole("button", { name: "Return for changes" }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent("Enter a reason before returning the order.");
    expect(shopOrders.reviewShopOrder).not.toHaveBeenCalled();
  });

  it("adds a supplier and its product to the same batch before approval", async () => {
    const user = userEvent.setup();
    const internal = { ...request, batchId: "batch-1" };
    const createdSupplierOrder: shopOrders.ShopOrderRequest = {
      ...request,
      id: "request-2",
      batchId: "batch-1",
      supplierId: "supplier-2",
      catalogSupplierName: "FC Dry Goods",
      lines: [{
        ...request.lines[0],
        id: "line-2",
        catalogItemId: "product-3",
        name: "Rice",
        unit: "bag",
        warehouse: "dry",
      }],
    };
    vi.mocked(shopOrders.fetchShopOrderRequests).mockImplementation(async (filters) => {
      if (filters?.requestId || filters?.batchId) return [internal];
      return [internal];
    });
    vi.mocked(shopOrders.createShopOrderRequest).mockResolvedValue(createdSupplierOrder);

    renderReview(`/restaurant/ordering/review/${request.id}`);
    expect(await screen.findByRole("heading", { name: request.requestNo })).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Add supplier" }));
    await user.click(screen.getByRole("option", { name: "FC Dry Goods" }));
    await user.click(screen.getByRole("button", { name: "Add supplier" }));
    expect(screen.getByRole("region", { name: "FC Dry Goods" })).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Add product" }));
    await user.click(screen.getByRole("option", { name: /FC Dry Goods.*Rice/ }));
    await user.click(screen.getByRole("button", { name: "Add product" }));
    await user.click(screen.getByRole("button", { name: "Approve order" }));

    await waitFor(() => expect(shopOrders.createShopOrderRequest).toHaveBeenCalledWith(expect.objectContaining({
      batchId: "batch-1",
      supplierId: "supplier-2",
      catalogSupplierName: "FC Dry Goods",
      lines: [{ catalogItemId: "product-3", quantity: 1 }],
    })));
    expect(shopOrders.reviewShopOrder).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "request-2",
      action: "approve",
    }));
  });

  it("keeps a sent order open and available in review history", async () => {
    const user = userEvent.setup();
    const reviewed = { ...request, status: "reviewed" };
    vi.mocked(shopOrders.fetchShopOrderRequests).mockResolvedValue([reviewed]);

    renderReview(`/restaurant/ordering/review/${request.id}`);
    expect(await screen.findByRole("heading", { name: request.requestNo })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send to factory" }));

    await waitFor(() => expect(shopOrders.sendShopOrderToFactory).toHaveBeenCalledWith(request.id));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Sent to the factory and shipment record created.");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("heading", { name: request.requestNo })).toBeInTheDocument();
    expect(screen.getAllByText("In transit").length).toBeGreaterThan(0);
  });

  it("shows one review row for all supplier requests in the same order", async () => {
    const secondSupplier: shopOrders.ShopOrderRequest = {
      ...request,
      id: "request-2",
      batchId: "batch-1",
      supplierId: "supplier-2",
      catalogSupplierName: "FC Dry Goods",
      lines: [{
        ...request.lines[0],
        id: "line-2",
        catalogItemId: "product-2",
        name: "Rice",
        quantity: 3,
        warehouse: "dry",
      }],
    };
    vi.mocked(shopOrders.fetchShopOrderRequests).mockResolvedValue([
      { ...request, batchId: "batch-1" },
      secondSupplier,
    ]);

    renderReview();

    expect(await screen.findAllByText(request.requestNo)).toHaveLength(1);
    expect(screen.getByText("FC Frozen、FC Dry Goods")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Open review" })).toHaveLength(1);
  });

  it("loads every supplier in the batch and reviews them together", async () => {
    const user = userEvent.setup();
    const internal = { ...request, batchId: "batch-1" };
    const secondSupplier: shopOrders.ShopOrderRequest = {
      ...request,
      id: "request-2",
      batchId: "batch-1",
      supplierId: "supplier-2",
      catalogSupplierName: "FC Dry Goods",
      lines: [{
        ...request.lines[0],
        id: "line-2",
        catalogItemId: "product-2",
        name: "Rice",
        quantity: 3,
        warehouse: "dry",
      }],
    };
    vi.mocked(shopOrders.fetchShopOrderRequests).mockImplementation(async (filters) => {
      if (filters?.requestId) return [internal];
      return [internal, secondSupplier];
    });

    renderReview();
    await user.click(await screen.findByRole("button", { name: "Open review" }));

    expect(await screen.findByRole("heading", { name: request.requestNo })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "FC Frozen" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "FC Dry Goods" })).toBeInTheDocument();
    expect(screen.getByText("Rice")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Step 3.*Review decision/ }));
    await user.click(screen.getByRole("button", { name: "Approve order" }));

    await waitFor(() => expect(shopOrders.reviewShopOrder).toHaveBeenCalledTimes(2));
    expect(shopOrders.reviewShopOrder).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "request-1",
      lines: [{ catalogItemId: "product-1", quantity: 1 }],
    }));
    expect(shopOrders.reviewShopOrder).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "request-2",
      lines: [{ catalogItemId: "product-2", quantity: 3 }],
    }));
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
