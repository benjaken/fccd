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

describe("FactoryWarehousePage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("shows warehouse nav without mixing catering factory board copy", () => {
    render(
      <MemoryRouter initialEntries={["/factory/warehouse"]}>
        <Routes>
          <Route path="/factory/warehouse" element={<FactoryWarehousePage />}>
            <Route index element={<p>pending-body</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "貨倉存貨" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /待出貨/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /出貨紀錄/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /入貨紀錄/ })).toBeInTheDocument();
    expect(screen.queryByText("當日暫無出車。")).not.toBeInTheDocument();
    expect(screen.getByText("pending-body")).toBeInTheDocument();
  });
});
