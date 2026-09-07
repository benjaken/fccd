import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FactoryWarehousePage } from "@/components/FactoryWarehousePage";
import i18n from "@/i18n";

vi.mock("@/auth/use-page-access", () => ({
  useCurrentPageAccess: () => ({
    canAccess: () => true,
    canManage: () => false,
    loading: false,
  }),
}));

describe("Restaurant ordering inventory records", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("shows only outbound and inbound tabs under restaurant ordering", () => {
    render(
      <MemoryRouter initialEntries={["/restaurant/ordering/inventory"]}>
        <Routes>
          <Route path="/restaurant/ordering/inventory" element={<FactoryWarehousePage />}>
            <Route index element={<p>outbound-body</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: i18n.t("shopWarehouse.title") })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByRole("link", { name: i18n.t("shopWarehouse.nav.outbound") })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: i18n.t("shopWarehouse.nav.inbound") })).toBeInTheDocument();
    expect(screen.queryByText(i18n.t("shopWarehouse.nav.pending"))).not.toBeInTheDocument();
    expect(screen.getByText("outbound-body")).toBeInTheDocument();
  });
});
