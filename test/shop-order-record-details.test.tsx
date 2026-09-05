import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OfficeShopReviewPage } from "@/components/OfficeShopOrderingPages";
import { ShopOrderRecordsPage } from "@/components/ShopOrderRecordsPage";
import i18n from "@/i18n";
import * as shopOrders from "@/lib/shop-orders";

vi.mock("@/auth/use-page-access", () => ({
  useCurrentPageAccess: () => ({ canAccess: () => true }),
}));

vi.mock("@/lib/shop-orders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/shop-orders")>("@/lib/shop-orders");
  return {
    ...actual,
    fetchShopCatalog: vi.fn(),
    fetchShopOrderRecords: vi.fn(),
    fetchShopOrderRequests: vi.fn(),
    reviewShopOrder: vi.fn(),
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
  deliveryDate: "2026-09-10",
  status: "submitted",
  note: "Morning delivery",
  contactPhone: null,
  whatsappCallStatus: null,
  whatsappCalledAt: null,
  createdAt: "2026-09-05T02:00:00Z",
  lines: [{
    id: "line-1",
    catalogItemId: "item-1",
    name: "Beef slices",
    unit: "pack",
    sku: "B1",
    quantity: 2,
    warehouse: "frozen",
  }],
};

describe("office shop order record details", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    vi.mocked(shopOrders.fetchShopOrderRecords).mockResolvedValue([request]);
    vi.mocked(shopOrders.fetchShopOrderRequests).mockResolvedValue([request]);
    vi.mocked(shopOrders.fetchShopCatalog).mockResolvedValue([
      {
        id: "item-1",
        sku: "B1",
        name: "Beef slices",
        unit: "pack",
        supplierName: "FC Frozen",
        channel: "fc_internal",
        warehouse: "frozen",
        fccSupplierId: "supplier-1",
        sortOrder: 1,
      },
      {
        id: "item-2",
        sku: "P1",
        name: "Pork belly",
        unit: "box",
        supplierName: "FC Frozen",
        channel: "fc_internal",
        warehouse: "frozen",
        fccSupplierId: "supplier-1",
        sortOrder: 2,
      },
    ]);
    vi.mocked(shopOrders.reviewShopOrder).mockResolvedValue(undefined);
  });

  it("opens order details and saves existing and newly added items", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/restaurant/ordering/records"]}>
        <Routes>
          <Route path="/restaurant/ordering/records" element={<ShopOrderRecordsPage office />} />
          <Route path="/restaurant/ordering/review/:requestId" element={<OfficeShopReviewPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", {
      name: "View order SO-20260905-0001 details",
    }));

    expect(await screen.findByRole("heading", { name: "SO-20260905-0001" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Morning delivery")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Step 2.*Order items/ }));
    expect(screen.getByText("Beef slices")).toBeInTheDocument();

    await waitFor(() => expect(shopOrders.fetchShopCatalog).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("spinbutton", { name: "Edit quantity for Beef slices" })).toHaveValue(2);
    await user.click(screen.getByRole("combobox", { name: "Add product" }));
    await user.click(screen.getByRole("option", { name: /Pork belly/ }));
    await user.click(screen.getByRole("button", { name: "Add product" }));
    const porkQuantity = screen.getByRole("spinbutton", {
      name: "Edit quantity for Pork belly",
    });
    await user.clear(porkQuantity);
    await user.type(porkQuantity, "3");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(shopOrders.reviewShopOrder).toHaveBeenCalledWith({
        requestId: "request-1",
        deliveryDate: "2026-09-10",
        note: "Morning delivery",
        reviewNote: "",
        action: "save",
        lines: [
          { catalogItemId: "item-1", quantity: 2 },
          { catalogItemId: "item-2", quantity: 3 },
        ],
      });
    });
    expect(screen.getByText("Pork belly")).toBeInTheDocument();
  });

  it("shows internal and external supplier goods under one order record", async () => {
    const external: shopOrders.ShopOrderRequest = {
      ...request,
      id: "request-external",
      batchId: "batch-1",
      channel: "external",
      supplierId: "supplier-2",
      catalogSupplierName: "Tea Supplier",
      status: "saved",
      lines: [{
        id: "line-2",
        catalogItemId: "item-3",
        name: "Jasmine tea",
        unit: "box",
        sku: "T1",
        quantity: 4,
        warehouse: null,
      }],
    };
    const internal = { ...request, batchId: "batch-1" };
    vi.mocked(shopOrders.fetchShopOrderRecords).mockResolvedValue([{
      ...internal,
      id: "batch-1",
      catalogSupplierName: "FC Frozen、Tea Supplier",
      lines: [...internal.lines, ...external.lines],
      supplierOrders: [internal, external],
    }]);
    const user = userEvent.setup();
    render(<MemoryRouter><ShopOrderRecordsPage office /></MemoryRouter>);

    expect(await screen.findAllByText("SO-20260905-0001")).toHaveLength(1);
    await user.click(screen.getByRole("button", {
      name: "View order SO-20260905-0001 details",
    }));

    expect(screen.getByText("FC Frozen")).toBeInTheDocument();
    expect(screen.getByText("Tea Supplier")).toBeInTheDocument();
    expect(screen.getAllByText("Beef slices").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Jasmine tea").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Edit / add items" })).not.toBeInTheDocument();
  });
});
