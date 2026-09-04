import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShopOrderPage } from "@/components/ShopOrderPage";
import { ShopOrderRecordsPage } from "@/components/ShopOrderRecordsPage";
import i18n from "@/i18n";
import * as shopOrders from "@/lib/shop-orders";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ profile: { shop_restro_id: "67ea658e-627a-4d62-a90c-58ea5cf7e3dc", shop_restro_legacy_id: null } }),
}));

vi.mock("@/lib/shop-orders", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/shop-orders")>();
  return {
    ...original,
    fetchShopCatalog: vi.fn(),
    fetchShopContacts: vi.fn(),
    fetchShopOrderRequests: vi.fn(),
    createShopOrderRequest: vi.fn(),
    markShopOrderWhatsAppCall: vi.fn(),
  };
});

vi.mock("@/lib/restaurant-staff", () => ({
  fetchRestaurantOptions: vi.fn().mockResolvedValue([
    { id: "67ea658e-627a-4d62-a90c-58ea5cf7e3dc", name: "TKO" },
  ]),
}));

const externalItem = {
  id: "item-1",
  sku: null,
  name: "Tea",
  unit: "box",
  supplierName: "Supplier",
  channel: "external" as const,
  warehouse: null,
  fccSupplierId: "supplier-1",
  sortOrder: 1,
};

const internalItem = {
  id: "item-2",
  sku: "FC-1",
  name: "Beef",
  unit: "pack",
  supplierName: "FC Frozen",
  channel: "fc_internal" as const,
  warehouse: "frozen" as const,
  fccSupplierId: "supplier-fc",
  sortOrder: 2,
};

describe("shop order page", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    vi.mocked(shopOrders.fetchShopCatalog).mockResolvedValue([externalItem]);
    vi.mocked(shopOrders.fetchShopContacts).mockResolvedValue([]);
    vi.mocked(shopOrders.fetchShopOrderRequests).mockResolvedValue([]);
    vi.mocked(shopOrders.createShopOrderRequest).mockResolvedValue({
      id: "request-1",
      requestNo: "WX-1",
    } as shopOrders.ShopOrderRequest);
  });

  it("still saves an external order when the supplier has no phone number", async () => {
    const user = userEvent.setup();
    render(<ShopOrderPage />);

    const supplierSelect = await screen.findByRole("combobox", { name: "Choose supplier" });
    await user.selectOptions(supplierSelect, screen.getByRole("option", { name: "Supplier · External" }));
    await user.click(screen.getByRole("button", { name: "Add supplier" }));
    await user.type(await screen.findByRole("spinbutton", { name: "Tea Qty" }), "2");
    await user.click(screen.getByRole("button", { name: "Submit whole order" }));

    await waitFor(() => expect(shopOrders.createShopOrderRequest).toHaveBeenCalledTimes(1));
    expect(shopOrders.markShopOrderWhatsAppCall).not.toHaveBeenCalled();
    expect(await screen.findByText("Order submitted for 1 suppliers and 1 items.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Shop")).not.toBeInTheDocument();
  });

  it("submits multiple suppliers with one delivery date and routes each channel correctly", async () => {
    const user = userEvent.setup();
    vi.mocked(shopOrders.fetchShopCatalog).mockResolvedValue([externalItem, internalItem]);
    vi.mocked(shopOrders.createShopOrderRequest).mockImplementation(async (input) => ({
      id: `request-${input.channel}`,
      requestNo: input.channel === "fc_internal" ? "SO-FC" : "SO-EXT",
      catalogSupplierName: input.catalogSupplierName,
    } as shopOrders.ShopOrderRequest));
    render(<ShopOrderPage />);

    const supplierSelect = await screen.findByRole("combobox", { name: "Choose supplier" });
    await user.selectOptions(supplierSelect, screen.getByRole("option", { name: "Supplier · External" }));
    await user.click(screen.getByRole("button", { name: "Add supplier" }));
    await user.type(screen.getByRole("spinbutton", { name: "Tea Qty" }), "2");
    await user.click(screen.getByRole("button", { name: "Add supplier" }));
    const nextSupplierSelect = screen.getByRole("combobox", { name: "Choose supplier" });
    await user.selectOptions(nextSupplierSelect, screen.getByRole("option", { name: "FC Frozen · FC internal" }));
    await user.click(screen.getByRole("button", { name: "Add supplier" }));
    await user.type(screen.getByRole("spinbutton", { name: "Beef Qty" }), "3");
    await user.click(screen.getByRole("button", { name: "Submit whole order" }));

    await waitFor(() => expect(shopOrders.createShopOrderRequest).toHaveBeenCalledTimes(2));
    expect(shopOrders.createShopOrderRequest).toHaveBeenCalledWith(expect.objectContaining({
      channel: "external",
      deliveryDate: expect.any(String),
      lines: [{ catalogItemId: "item-1", quantity: 2 }],
    }));
    expect(shopOrders.createShopOrderRequest).toHaveBeenCalledWith(expect.objectContaining({
      channel: "fc_internal",
      deliveryDate: expect.any(String),
      lines: [{ catalogItemId: "item-2", quantity: 3 }],
    }));
    expect(await screen.findByText("Order submitted for 2 suppliers and 2 items.")).toBeInTheDocument();
  });

  it("scopes restaurant records to the phase-one shop but leaves office records unfiltered", async () => {
    const { unmount } = render(<ShopOrderRecordsPage />);
    await waitFor(() => expect(shopOrders.fetchShopOrderRequests).toHaveBeenCalledWith({
      restaurantId: shopOrders.TKO_RESTAURANT_ID,
    }));
    unmount();

    render(<ShopOrderRecordsPage office />);
    await waitFor(() => expect(shopOrders.fetchShopOrderRequests).toHaveBeenLastCalledWith(undefined));
  });
});
