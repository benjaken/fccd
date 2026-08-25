import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { KitchenSalesCostReportPage } from "@/components/KitchenSalesCostReportPage";

const reportMocks = vi.hoisted(() => ({
  fetchKitchenSalesCostReport: vi.fn(),
}));

vi.mock("@/lib/kitchen-sales-cost-report", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/kitchen-sales-cost-report")>()),
  fetchKitchenSalesCostReport: reportMocks.fetchKitchenSalesCostReport,
}));

describe("central kitchen sales and cost report page", () => {
  it("renders the newest annual detail above older years", async () => {
    reportMocks.fetchKitchenSalesCostReport.mockResolvedValue({
      rows: [
        { year: 2025, month: 1, category: "Sales", amount: 1000 },
        { year: 2026, month: 1, category: "Sales", amount: 1200 },
      ],
    });

    const { container } = render(
      <MemoryRouter>
        <KitchenSalesCostReportPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const yearCards = Array.from(
        container.querySelectorAll<HTMLElement>("[data-report-year]"),
      );
      expect(yearCards.map((card) => card.dataset.reportYear)).toEqual([
        "2026",
        "2025",
      ]);
      expect(yearCards.map((card) => card.style.order)).toEqual([
        "-2026",
        "-2025",
      ]);
    });
  });
});
