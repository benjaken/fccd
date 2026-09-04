import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { FestivalOrderGenerationReportPage } from "@/components/FestivalOrderGenerationReportPage";

const reportMocks = vi.hoisted(() => ({
  fetchFestivalOrderGenerationReport: vi.fn(),
}));

vi.mock("@/lib/festival-order-generation-report", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/festival-order-generation-report")>()),
  fetchFestivalOrderGenerationReport: reportMocks.fetchFestivalOrderGenerationReport,
}));

vi.mock("@/components/report-ai/ReportAiWorkspace", () => ({
  ReportAiTrigger: () => null,
  useReportAiSnapshot: () => {},
}));

describe("festival order generation report page", () => {
  it("compares festival order counts across years and shows monthly detail", async () => {
    const user = userEvent.setup();
    reportMocks.fetchFestivalOrderGenerationReport.mockResolvedValue({
      rows: [
        { festivalKey: "中秋節", festivalLabel: "中秋節", year: 2024, month: 9, orderCount: 62 },
        { festivalKey: "中秋節", festivalLabel: "中秋節", year: 2025, month: 9, orderCount: 70 },
        { festivalKey: "父親節", festivalLabel: "父親節", year: 2024, month: 6, orderCount: 24 },
        { festivalKey: "父親節", festivalLabel: "父親節", year: 2025, month: 6, orderCount: 22 },
      ],
    });

    render(
      <MemoryRouter>
        <FestivalOrderGenerationReportPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "節日訂單生成數量" })).toBeInTheDocument();

    const yearlyTable = await screen.findByRole("table", {
      name: "每年每個節日的訂單生成數量",
    });
    expect(within(yearlyTable).getByRole("button", { name: "中秋節" })).toBeInTheDocument();
    expect(within(yearlyTable).getByRole("button", { name: "父親節" })).toBeInTheDocument();

    const midAutumnRow = yearlyTable.querySelector('[data-festival="中秋節"]');
    expect(midAutumnRow).toHaveClass("is-selected");
    expect(
      within(midAutumnRow as HTMLElement).getByText("70"),
    ).toBeInTheDocument();
    expect(
      within(midAutumnRow as HTMLElement).getByText("+8（+12.9%）"),
    ).toBeInTheDocument();

    await user.click(within(yearlyTable).getByRole("button", { name: "父親節" }));
    await waitFor(() => {
      expect(yearlyTable.querySelector('[data-festival="父親節"]')).toHaveClass("is-selected");
    });
    expect(
      screen.getByRole("table", { name: "父親節每月訂單生成數量" }),
    ).toBeInTheDocument();
    const june = document.querySelector('[data-report-month="6"]');
    expect(june).not.toBeNull();
    expect(within(june as HTMLElement).getByText("22")).toBeInTheDocument();
    expect(within(june as HTMLElement).getByText("-2（-8.3%）")).toBeInTheDocument();
  });
});
