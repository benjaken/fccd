import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { KitchenChannelSalesReportPage } from "@/components/KitchenChannelSalesReportPage";

const reportMocks = vi.hoisted(() => ({
  fetchKitchenChannelSalesReport: vi.fn(),
}));

vi.mock("@/lib/kitchen-channel-sales-report", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/kitchen-channel-sales-report")>()),
  fetchKitchenChannelSalesReport: reportMocks.fetchKitchenChannelSalesReport,
}));

describe("central kitchen channel sales report page", () => {
  it("uses a distinct text tone for each year without year-specific backgrounds", async () => {
    reportMocks.fetchKitchenChannelSalesReport.mockResolvedValue({
      rows: [
        { year: 2025, month: 1, channel: "Catering", amount: 1000 },
        { year: 2026, month: 1, channel: "Catering", amount: 1200 },
      ],
    });

    const { container } = render(
      <MemoryRouter>
        <KitchenChannelSalesReportPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const yearValues = Array.from(
        container.querySelectorAll<HTMLElement>(
          ".kitchen-channel-sales-year-value[data-report-year]",
        ),
      );
      expect(yearValues.length).toBeGreaterThan(0);

      const tonesByYear = new Map(
        yearValues.map((value) => [
          value.dataset.reportYear,
          value.style.getPropertyValue("--year-tone-color"),
        ]),
      );
      expect(tonesByYear.get("2025")).toBeTruthy();
      expect(tonesByYear.get("2026")).toBeTruthy();
      expect(tonesByYear.get("2025")).not.toBe(tonesByYear.get("2026"));
      expect(yearValues.every((value) => value.style.background === "")).toBe(true);
    });
  });
});
