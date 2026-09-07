import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FactoryWarehouseReceiptsPage } from "@/components/FactoryWarehousePages";
import i18n from "@/i18n";

vi.mock("@/lib/shop-orders", () => ({
  fetchShopCatalog: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/shop-warehouse", () => ({
  fetchShopWarehouseReceipts: vi.fn().mockResolvedValue([]),
  recordShopWarehouseReceipt: vi.fn(),
}));

describe("Restaurant ordering inbound records", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("opens the inbound form from a toolbar button", async () => {
    const user = userEvent.setup();
    render(<FactoryWarehouseReceiptsPage />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: i18n.t("shopWarehouse.receiptFormTitle") }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: i18n.t("shopWarehouse.receiptFormTitle") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: i18n.t("common.cancel") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: i18n.t("shopWarehouse.saveReceipt") })).toBeInTheDocument();
  });
});
