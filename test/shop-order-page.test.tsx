import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    fetchShopOrderRecords: vi.fn(),
    createShopOrderBatch: vi.fn(),
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

function setMobileViewport(matches: boolean) {
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches: query === "(max-width: 760px)" ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => setMobileViewport(false));

describe("shop order page", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    vi.mocked(shopOrders.fetchShopCatalog).mockResolvedValue([externalItem]);
    vi.mocked(shopOrders.fetchShopContacts).mockResolvedValue([]);
    vi.mocked(shopOrders.fetchShopOrderRequests).mockResolvedValue([]);
    vi.mocked(shopOrders.fetchShopOrderRecords).mockResolvedValue([]);
    vi.mocked(shopOrders.createShopOrderBatch).mockImplementation(async (input) =>
      input.groups.map((group, index) => ({
        id: `request-${index + 1}`,
        batchId: "batch-1",
        requestNo: "SO-BATCH-1",
        channel: group.channel,
        supplierId: group.supplierId,
        catalogSupplierName: group.catalogSupplierName,
      } as shopOrders.ShopOrderRequest)),
    );
    vi.mocked(shopOrders.createShopOrderRequest).mockResolvedValue({
      id: "request-1",
      requestNo: "WX-1",
    } as shopOrders.ShopOrderRequest);
  });

  it("still saves an external order when the supplier has no phone number", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ShopOrderPage /></MemoryRouter>);

    const supplierSelect = await screen.findByRole("combobox", { name: "Choose supplier" });
    await user.selectOptions(supplierSelect, screen.getByRole("option", { name: "Supplier · External" }));
    await user.click(screen.getByRole("button", { name: "Add supplier" }));
    await user.type(await screen.findByRole("spinbutton", { name: "Tea Qty" }), "2");
    await user.click(screen.getByRole("button", { name: "Done selecting" }));
    await user.click(screen.getByRole("button", { name: "Submit whole order" }));

    await waitFor(() => expect(shopOrders.createShopOrderBatch).toHaveBeenCalledTimes(1));
    expect(shopOrders.createShopOrderBatch).toHaveBeenCalledWith(expect.objectContaining({
      groups: [expect.objectContaining({
        channel: "external",
        lines: [{ catalogItemId: "item-1", quantity: 2 }],
      })],
    }));
    expect(shopOrders.markShopOrderWhatsAppCall).not.toHaveBeenCalled();
    expect(await screen.findByText("Order submitted for 1 suppliers and 1 items.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Shop")).not.toBeInTheDocument();
  });

  it("submits multiple suppliers with one delivery date and routes each channel correctly", async () => {
    const user = userEvent.setup();
    vi.mocked(shopOrders.fetchShopCatalog).mockResolvedValue([externalItem, internalItem]);
    vi.mocked(shopOrders.fetchShopContacts).mockImplementation(async (supplierId) => supplierId === "supplier-1" ? [{
      id: "contact-1",
      supplierId: "supplier-1",
      name: "Supplier contact",
      phone: "61234567",
      note: null,
    }] : []);
    render(<MemoryRouter><ShopOrderPage /></MemoryRouter>);

    const supplierSelect = await screen.findByRole("combobox", { name: "Choose supplier" });
    await user.selectOptions(supplierSelect, screen.getByRole("option", { name: "Supplier · External" }));
    await user.click(screen.getByRole("button", { name: "Add supplier" }));
    await user.type(screen.getByRole("spinbutton", { name: "Tea Qty" }), "2");
    await user.click(screen.getByRole("button", { name: "Done selecting" }));
    await user.click(screen.getByRole("button", { name: "Add supplier" }));
    const nextSupplierSelect = screen.getByRole("combobox", { name: "Choose supplier" });
    await user.selectOptions(nextSupplierSelect, screen.getByRole("option", { name: "FC Frozen · FC internal" }));
    await user.click(screen.getByRole("button", { name: "Add supplier" }));
    await user.type(screen.getByRole("spinbutton", { name: "Beef Qty" }), "3");
    await user.click(screen.getByRole("button", { name: "Done selecting" }));
    await user.click(screen.getByRole("button", { name: "Submit whole order" }));

    await waitFor(() => expect(shopOrders.createShopOrderBatch).toHaveBeenCalledTimes(1));
    expect(shopOrders.createShopOrderBatch).toHaveBeenCalledWith(expect.objectContaining({
      deliveryDate: expect.any(String),
      groups: expect.arrayContaining([
        expect.objectContaining({
          channel: "external",
          lines: [{ catalogItemId: "item-1", quantity: 2 }],
        }),
        expect.objectContaining({
          channel: "fc_internal",
          lines: [{ catalogItemId: "item-2", quantity: 3 }],
        }),
      ]),
    }));
    expect(await screen.findByText("Order submitted for 2 suppliers and 2 items.")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Send WhatsApp" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Send SMS" })).toBeInTheDocument();
  });

  it("scopes restaurant records to the phase-one shop but leaves office records unfiltered", async () => {
    const { unmount } = render(<MemoryRouter><ShopOrderRecordsPage /></MemoryRouter>);
    await waitFor(() => expect(shopOrders.fetchShopOrderRecords).toHaveBeenCalledWith({
      restaurantId: shopOrders.TKO_RESTAURANT_ID,
    }));
    unmount();

    render(<MemoryRouter><ShopOrderRecordsPage office /></MemoryRouter>);
    await waitFor(() => expect(shopOrders.fetchShopOrderRecords).toHaveBeenLastCalledWith(undefined));
  });

  it("opens the supplier picker as a compact mobile bottom sheet", async () => {
    setMobileViewport(true);
    const user = userEvent.setup();
    render(<MemoryRouter><ShopOrderPage /></MemoryRouter>);

    await screen.findByText("Choose a supplier first");
    expect(screen.queryByRole("combobox", { name: "Choose supplier" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Choose a supplier to start" }));
    const sheet = screen.getByRole("dialog", { name: "Choose supplier" });
    expect(sheet).toBeInTheDocument();
    expect(within(sheet).getByText("Work with one supplier at a time, then add another supplier when ready.")).toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Choose supplier" }),
      screen.getByRole("option", { name: "Supplier · External" }),
    );
    await user.click(screen.getByRole("button", { name: "Add supplier" }));
    expect(screen.queryByRole("dialog", { name: "Choose supplier" })).not.toBeInTheDocument();
  });
});
