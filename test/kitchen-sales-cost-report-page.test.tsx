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
  it("merges selected years into the same monthly cells without a comparison sidebar", async () => {
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
      expect(container.querySelectorAll(".kitchen-sales-cost-table")).toHaveLength(1);
      expect(container.querySelectorAll("[data-report-month]")).toHaveLength(12);

      const firstMonthSalesCell = container.querySelector("[data-report-month='1'] td");
      const comparedYears = Array.from(
        firstMonthSalesCell?.querySelectorAll<HTMLElement>("[data-report-year]") ?? [],
      );
      expect(comparedYears.map((row) => row.dataset.reportYear)).toEqual(["2025", "2026"]);
      expect(comparedYears.every((row) => row.closest("td") === firstMonthSalesCell)).toBe(true);

      const filter = container.querySelector(".kitchen-sales-cost-filter");
      const table = container.querySelector(".kitchen-sales-cost-table");
      expect(filter).not.toBeNull();
      expect(filter?.compareDocumentPosition(table as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(container.querySelector(".kitchen-sales-cost-sidebar")).toBeNull();
      expect(container.querySelector(".kitchen-sales-cost-overview")).toBeNull();
      expect(container.querySelector(".report-ai-actions-left")).not.toBeNull();
      expect(container.querySelector(".kitchen-sales-cost-year-chart")).toBeNull();
    });
  });
});
