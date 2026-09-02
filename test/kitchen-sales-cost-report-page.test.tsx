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
  it("merges selected years into the same monthly cells with left category rows", async () => {
    reportMocks.fetchKitchenSalesCostReport.mockResolvedValue({
      rows: [
        { year: 2025, month: 1, category: "Sales", amount: 1000 },
        { year: 2025, month: 1, category: "Google", amount: 100 },
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
      expect(container.querySelectorAll(".kitchen-sales-cost-comparison-table thead th")).toHaveLength(14);
      expect(
        Array.from(container.querySelectorAll(".kitchen-sales-cost-comparison-table thead th"))
          .slice(0, 1)
          .map((header) => header.textContent),
      ).toEqual(["類型"]);
      expect(container.querySelectorAll("[data-report-month]")).toHaveLength(36);

      const firstMonthGoogleCell = container.querySelector(
        "tr:nth-child(2) td[data-report-month='1']",
      );
      expect(firstMonthGoogleCell?.querySelectorAll("[data-report-year]")).toHaveLength(2);
      expect(
        Array.from(firstMonthGoogleCell?.querySelectorAll<HTMLElement>("[data-report-year]") ?? [])
          .map((row) => row.dataset.reportYear),
      ).toEqual(["2025", "2026"]);
      expect(firstMonthGoogleCell?.textContent).toContain("$100");
      expect(firstMonthGoogleCell?.textContent).toContain("10%");
      expect(container.querySelector(".kitchen-sales-cost-year-legend")?.textContent).toContain("2025");
      expect(container.querySelector(".kitchen-sales-cost-year-legend")?.textContent).toContain("2026");
      expect(container.querySelector(".kitchen-sales-cost-ratio-legend")?.textContent).toContain("紅色為佔比");
      expect(container.querySelector("tbody .kitchen-sales-cost-net-row")).toBeNull();
      expect(container.querySelector("tfoot .kitchen-sales-cost-net-row")).not.toBeNull();

      const filter = container.querySelector(".kitchen-sales-cost-filter");
      const table = container.querySelector(".kitchen-sales-cost-table");
      expect(filter).not.toBeNull();
      expect(filter?.compareDocumentPosition(table as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(container.querySelector(".kitchen-sales-cost-sidebar")).not.toBeNull();
      expect(container.querySelector(".kitchen-sales-cost-overview")).toBeNull();
      expect(container.querySelector(".report-ai-actions-left")).not.toBeNull();
      expect(container.querySelector(".kitchen-sales-cost-year-chart")).toBeNull();
    });
  });
});
