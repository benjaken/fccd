import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("alternates colored and black text for each year line without backgrounds", async () => {
    const user = userEvent.setup();
    reportMocks.fetchKitchenChannelSalesReport.mockResolvedValue({
      rows: [
        { year: 2023, month: 1, channel: "Catering", amount: 800 },
        { year: 2024, month: 1, channel: "Catering", amount: 900 },
        { year: 2025, month: 1, channel: "Catering", amount: 1000 },
        { year: 2026, month: 1, channel: "Catering", amount: 1200 },
      ],
    });

    const { container } = render(
      <MemoryRouter>
        <KitchenChannelSalesReportPage />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "全選" }));

    const workspace = container.querySelector(".kitchen-channel-sales-workspace");
    expect(workspace?.firstElementChild).toHaveClass("kitchen-sales-cost-sidebar");
    expect(container.querySelector(".kitchen-channel-sales-charts")).toBeNull();
    expect(container.querySelector(".kitchen-channel-sales-chart")).toBeNull();
    expect(within(workspace as HTMLElement).getByLabelText("報表篩選")).toBeInTheDocument();

    await waitFor(() => {
      const yearValues = Array.from(
        container.querySelectorAll<HTMLElement>(
          ".kitchen-channel-sales-year-value[data-report-year]",
        ),
      );
      expect(yearValues.length).toBeGreaterThan(0);

      const firstCell = container.querySelector<HTMLElement>(
        ".kitchen-channel-sales-cell-values",
      );
      const firstCellYearValues = Array.from(
        firstCell?.querySelectorAll<HTMLElement>(
          ".kitchen-channel-sales-year-value",
        ) ?? [],
      );

      expect(
        firstCellYearValues.map((value) =>
          value.style.getPropertyValue("--year-tone-color"),
        ),
      ).toEqual(["#dc8a19", "#111827", "#0a7e3a", "#111827"]);
      expect(yearValues.every((value) => value.style.background === "")).toBe(true);
    });
  });

  it("shows only checked brands and initially checks brands with sales in the selected year", async () => {
    const user = userEvent.setup();
    reportMocks.fetchKitchenChannelSalesReport.mockResolvedValue({
      rows: [
        { year: 2024, month: 1, channel: "Kitchen", amount: 500 },
        { year: 2025, month: 1, channel: "Catering", amount: 1000 },
        { year: 2025, month: 1, channel: "HK lunch box", amount: 800 },
        { year: 2025, month: 1, channel: "Kitchen", amount: 0 },
      ],
    });

    const { container } = render(
      <MemoryRouter>
        <KitchenChannelSalesReportPage />
      </MemoryRouter>,
    );

    const catering = await screen.findByRole("checkbox", { name: "CATERING" });
    const lunchBox = screen.getByRole("checkbox", { name: "LUNCH BOX" });
    const kitchen = screen.getByRole("checkbox", { name: "KITCHEN" });

    await waitFor(() => {
      expect(catering).toBeChecked();
      expect(lunchBox).toBeChecked();
      expect(kitchen).not.toBeChecked();
    });

    const columnNames = () =>
      within(container.querySelector("table") as HTMLTableElement)
        .getAllByRole("columnheader")
        .map((header) => header.textContent);

    expect(columnNames()).toEqual([
      "月份",
      "CATERING",
      "LUNCH BOX",
      "年度月份總數",
    ]);

    await user.click(lunchBox);
    expect(columnNames()).toEqual(["月份", "CATERING", "年度月份總數"]);

    await user.click(kitchen);
    expect(columnNames()).toEqual([
      "月份",
      "CATERING",
      "KITCHEN",
      "年度月份總數",
    ]);
  });
});
