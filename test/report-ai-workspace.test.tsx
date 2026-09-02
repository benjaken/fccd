import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/report-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/report-ai")>();
  return {
    ...actual,
    requestReportAiInterpretation: vi.fn().mockResolvedValue({
      status: "complete",
      headline: "Sales improved",
      trends: [],
      anomalies: [],
      limitations: ["Current report only"],
      coverage: {
        summaryRows: 1,
        comparisonRows: 0,
        detailRows: 0,
        truncated: false,
      },
      generatedAt: "2026-08-23T12:00:00.000Z",
      cacheKey: "test-cache-key",
    }),
  };
});

import {
  ReportAiSnapshotPublisher,
  ReportAiTrigger,
  ReportAiWorkspace,
} from "@/components/report-ai/ReportAiWorkspace";

describe("ReportAiWorkspace", () => {
  it("opens the panel and starts interpreting with one click", async () => {
    const user = userEvent.setup();
    render(
      <ReportAiWorkspace
        reportKey="shopSales"
        permissionKey="reports.shop_sales"
        reportTitle="Sales report"
      >
        <ReportAiSnapshotPublisher
          snapshot={{
            filters: { year: 2026 },
            currentAggregates: [{ month: 1, sales: 120 }],
            completeness: { status: "complete" },
          }}
        />
        <div>Report content</div>
        <ReportAiTrigger />
      </ReportAiWorkspace>,
    );

    const trigger = await screen.findByRole("button", { name: "開啟 AI 解讀" });
    expect(trigger).toBeEnabled();

    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "AI 解讀" })).toBeVisible();
    expect(await screen.findByText("Sales improved")).toBeVisible();
  });

  it("allows the floating trigger to be dismissed", async () => {
    const user = userEvent.setup();
    render(
      <ReportAiWorkspace
        reportKey="shopSales"
        permissionKey="reports.shop_sales"
        reportTitle="Sales report"
      >
        <ReportAiSnapshotPublisher
          snapshot={{
            filters: { year: 2026 },
            currentAggregates: [{ month: 1, sales: 120 }],
            completeness: { status: "complete" },
          }}
        />
        <ReportAiTrigger />
      </ReportAiWorkspace>,
    );

    const trigger = document.querySelector<HTMLButtonElement>(".report-ai-trigger");
    const close = document.querySelector<HTMLButtonElement>(".report-ai-floating-close");
    expect(trigger).toBeInTheDocument();
    expect(close).toBeInTheDocument();

    await user.click(close!);

    expect(trigger).not.toBeInTheDocument();
  });
});
