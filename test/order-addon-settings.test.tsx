import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OrderAddonProductsSettings } from "@/components/OrderAddonSettings";

const addonMocks = vi.hoisted(() => ({
  addAddonProduct: vi.fn(),
  fetchAddonChannels: vi.fn(),
  fetchAddonProductSettings: vi.fn(),
  searchAddonProducts: vi.fn(),
}));

vi.mock("@/lib/self-service-addons", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/self-service-addons")>()),
  addAddonProduct: addonMocks.addAddonProduct,
  fetchAddonChannels: addonMocks.fetchAddonChannels,
  fetchAddonProductSettings: addonMocks.fetchAddonProductSettings,
  searchAddonProducts: addonMocks.searchAddonProducts,
}));

describe("OrderAddonProductsSettings", () => {
  it("filters products by brand and keeps one product-search control", async () => {
    const user = userEvent.setup();
    const onCreateOpenChange = vi.fn();
    addonMocks.fetchAddonChannels.mockResolvedValue([
      { id: "channel-1", name: "HK lunch box" },
    ]);
    addonMocks.fetchAddonProductSettings.mockResolvedValue([]);
    addonMocks.searchAddonProducts.mockResolvedValue([
      {
        id: "product-1",
        channelId: "channel-1",
        channelName: "HK lunch box",
        sku: "LB-001",
        name: "燒雞飯盒",
        price: 68,
      },
    ]);
    addonMocks.addAddonProduct.mockResolvedValue(undefined);

    render(
      <OrderAddonProductsSettings
        canManage
        createOpen
        onCreateOpenChange={onCreateOpenChange}
      />,
    );

    const panel = await screen.findByRole("dialog", { name: "加入產品" });
    const brand = within(panel).getByRole("combobox", { name: "品牌" });
    expect(within(panel).getAllByRole("combobox", { name: "搜尋產品" })).toHaveLength(1);

    await user.click(brand);
    await user.click(await screen.findByRole("option", { name: "HK lunch box" }));
    const productSearch = await within(panel).findByRole("combobox", { name: "搜尋產品" });
    await waitFor(() => expect(productSearch).toBeEnabled());

    await user.click(productSearch);
    await user.click(await screen.findByRole("option", { name: /LB-001.*燒雞飯盒/ }));
    await user.click(within(panel).getByRole("button", { name: "加入" }));

    await waitFor(() => {
      expect(addonMocks.addAddonProduct).toHaveBeenCalledWith("channel-1", "product-1");
    });
    expect(onCreateOpenChange).toHaveBeenCalledWith(false);
  });
});
