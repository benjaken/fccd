import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportsPage } from "@/components/ReportsPage";
import i18n from "@/i18n";

const reports = vi.hoisted(() => ({
  fetchReportShops: vi.fn(),
  fetchShopOrderQuantities: vi.fn(),
}));

vi.mock("@/lib/reports", () => ({
  fetchReportShops: reports.fetchReportShops,
  fetchShopOrderQuantities: reports.fetchShopOrderQuantities,
}));

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { app_metadata: { role: "Super Admin" } },
    profile: { role: "Super Admin" },
  }),
}));

vi.mock("@/auth/use-page-access", async () => {
  const actual = await vi.importActual<typeof import("@/auth/use-page-access")>(
    "@/auth/use-page-access",
  );
  return {
    ...actual,
    usePageAccess: () => ({
      isSuperAdmin: true,
      loading: false,
      error: null,
      canAccess: () => true,
      canManage: () => true,
      canAccessSection: () => true,
    }),
  };
});

describe("Shop order quantity report", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    reports.fetchReportShops.mockResolvedValue([
      { id: "tko", name: "桂花小幸 TKO" },
      { id: "ylp", name: "桂花小幸 YLP" },
    ]);
    reports.fetchShopOrderQuantities.mockResolvedValue([
      {
        orderDate: "2026-06-01",
        shopId: "tko",
        shopName: "桂花小幸 TKO",
        productId: "product-1",
        productName: "豉油雞中翼",
        unit: "包",
        totalQuantity: 12,
      },
      {
        orderDate: "2026-06-01",
        shopId: "tko",
        shopName: "桂花小幸 TKO",
        productId: "product-2",
        productName: "煎釀三寶",
        unit: "包",
        totalQuantity: 18,
      },
    ]);
  });

  it("renders migrated quantity rows and total", async () => {
    render(<ReportsPage />);

    expect(
      await screen.findByRole("heading", { name: "Shop order quantities" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("豉油雞中翼")).toBeInTheDocument();
    expect(screen.getByText("煎釀三寶")).toBeInTheDocument();
    expect(screen.getAllByText("30").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeEnabled();
  });

  it("automatically queries after a single shop or date change", async () => {
    const user = userEvent.setup();
    render(<ReportsPage />);
    await screen.findByText("豉油雞中翼");

    await user.click(screen.getByRole("button", { name: "桂花小幸 TKO" }));
    const start = screen.getByLabelText("Start date");
    const end = screen.getByLabelText("End date");
    await user.clear(start);
    await user.type(start, "2026-06-01");
    await user.clear(end);
    await user.type(end, "2026-06-30");
    await waitFor(() =>
      expect(reports.fetchShopOrderQuantities).toHaveBeenLastCalledWith({
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        shopIds: ["tko"],
      }),
    );
  });
});
