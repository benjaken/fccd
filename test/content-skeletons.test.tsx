import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  AnalysisPanelSkeleton,
  DashboardSkeleton,
  ProfileSkeleton,
  QueuePageSkeleton,
  ReportSkeleton,
  TablePanelSkeleton,
} from "@/components/ui/content-skeletons";

const SKELETON_MIGRATIONS = [
  ["src/App.tsx", "DashboardSkeleton"],
  ["src/components/FollowUpPage.tsx", "QueuePageSkeleton"],
  ["src/components/settings/RolePermissionsPage.tsx", "TablePanelSkeleton"],
  ["src/components/ProfilePage.tsx", "ProfileSkeleton"],
  ["src/components/DataMigrationPage.tsx", "AnalysisPanelSkeleton"],
  ["src/components/ReportsPage.tsx", "ReportSkeleton"],
  ["src/components/MeatPriceReport.tsx", "ReportSkeleton"],
  ["src/components/RawMeatAveragePriceReport.tsx", "ReportSkeleton"],
  ["src/components/PreparedMeatStockReport.tsx", "ReportSkeleton"],
  ["src/components/SupplierPurchaseReport.tsx", "ReportSkeleton"],
] as const;

describe("content skeletons", () => {
  it.each([
    [<DashboardSkeleton label="Dashboard loading" />, "Dashboard loading"],
    [<QueuePageSkeleton label="Queue loading" />, "Queue loading"],
    [<ProfileSkeleton label="Profile loading" />, "Profile loading"],
    [<TablePanelSkeleton label="Permissions loading" />, "Permissions loading"],
    [<ReportSkeleton label="Report loading" analysis />, "Report loading"],
    [<AnalysisPanelSkeleton label="Analysis loading" />, "Analysis loading"],
  ])("renders an accessible hidden status for %s", (view, label) => {
    const { unmount } = render(view);
    expect(screen.getByRole("status")).toHaveTextContent(label);
    expect(document.querySelectorAll(".page-skeleton-bone").length).toBeGreaterThan(0);
    unmount();
  });

  it.each(SKELETON_MIGRATIONS)(
    "uses %s in %s",
    (relativePath, componentName) => {
      const source = readFileSync(
        path.resolve(process.cwd(), relativePath),
        "utf8",
      );

      expect(source).toContain(componentName);
    },
  );

  it("removes visible spinner/plain-text page loading branches", () => {
    for (const [relativePath] of SKELETON_MIGRATIONS) {
      const source = readFileSync(
        path.resolve(process.cwd(), relativePath),
        "utf8",
      );

      expect(source).not.toContain('className="dashboard-loading"');
      expect(source).not.toContain('className="relationship-analysis-loading"');
      expect(source).not.toContain(
        '<div className="report-state">{t("reports.loading")}</div>',
      );
    }
  });
});
