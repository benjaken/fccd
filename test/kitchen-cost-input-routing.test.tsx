import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";

const kitchenCostInput = vi.hoisted(() => ({
  fetchKitchenCostReport: vi.fn(),
  fetchLatestKitchenAdvertisingCostWeekStart: vi.fn(),
}));

vi.mock("@/auth/use-page-access", () => ({
  useCurrentPageAccess: () => ({ canAccess: () => true }),
}));

vi.mock("@/lib/kitchen-cost-input", () => ({
  addDays: (date: string) => date,
  buildKitchenCostWeeks: () => [],
  createKitchenAdvertisingCost: vi.fn(),
  deleteKitchenAdvertisingCost: vi.fn(),
  fetchKitchenAdvertisingCosts: vi.fn(),
  fetchKitchenCostReport: kitchenCostInput.fetchKitchenCostReport,
  fetchLatestKitchenAdvertisingCostWeekStart:
    kitchenCostInput.fetchLatestKitchenAdvertisingCostWeekStart,
  formatWeekRange: () => "",
  getKitchenCostCell: () => ({ sales: 0, costs: {} }),
  hongKongDateKey: () => "2026-08-10",
  isMonday: () => true,
  mondayForDate: () => "2026-08-10",
  pastWeekOptions: () => [],
  previousCompleteWeekStart: "2026-08-10",
  updateKitchenAdvertisingCosts: vi.fn(),
}));

vi.mock("@/components/KitchenMonthlyNonFestivalCosts", () => ({
  KitchenMonthlyNonFestivalCosts: () => <div>monthly non-festival panel</div>,
}));
vi.mock("@/components/KitchenMonthlyFestivalCosts", () => ({
  KitchenMonthlyFestivalCosts: () => <div>monthly festival panel</div>,
}));
vi.mock("@/components/KitchenMonthlySupplierRecords", () => ({
  KitchenMonthlySupplierRecords: () => <div>monthly suppliers panel</div>,
}));

import { KitchenCostInputPage } from "@/components/KitchenCostInputPage";

function LocationDisplay() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderCostInput(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <KitchenCostInputPage />
      <LocationDisplay />
    </MemoryRouter>,
  );
}

describe("KitchenCostInputPage query-tab routing", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("zh-HK");
    kitchenCostInput.fetchLatestKitchenAdvertisingCostWeekStart.mockResolvedValue(null);
    kitchenCostInput.fetchKitchenCostReport.mockResolvedValue({
      weeks: [],
      channels: [],
      costTypes: [],
    });
  });

  it("selects the monthly non-festival tab from the query string", () => {
    renderCostInput("/kitchen/cost-input?tab=monthly-non-festival");

    expect(
      screen.getByRole("tab", { name: "每月營運費用（非節日）" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("monthly non-festival panel")).toBeInTheDocument();
  });

  it("synchronizes tab clicks and safely falls back from an unknown tab", async () => {
    renderCostInput("/kitchen/cost-input?tab=unknown");

    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "每週廣告費" }),
      ).toHaveAttribute("aria-selected", "true");
    });
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/kitchen/cost-input?tab=weekly-advertising",
    );
  });

  it("uses the requested date's Monday instead of replacing it with the latest week", async () => {
    kitchenCostInput.fetchLatestKitchenAdvertisingCostWeekStart.mockResolvedValue("2026-08-17");
    renderCostInput("/kitchen/cost-input?tab=weekly-advertising&week=2026-08-12");

    await waitFor(() => {
      expect(kitchenCostInput.fetchKitchenCostReport).toHaveBeenCalledWith("2026-08-10");
    });
    expect(kitchenCostInput.fetchKitchenCostReport).not.toHaveBeenCalledWith("2026-08-17");
  });
});
