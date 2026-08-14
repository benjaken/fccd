import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageSkeleton } from "@/components/ui/page-skeleton";

const SKELETON_PAGES = [
  "src/App.tsx",
  "src/components/FollowUpPage.tsx",
  "src/components/ProfilePage.tsx",
  "src/components/settings/RolePermissionsPage.tsx",
  "src/components/DataMigrationPage.tsx",
  "src/components/OrderDetailPage.tsx",
  "src/components/ProductDetailPage.tsx",
  "src/components/PackageDetailPage.tsx",
  "src/components/ReportsPage.tsx",
  "src/components/MeatPriceReport.tsx",
  "src/components/RawMeatAveragePriceReport.tsx",
  "src/components/PreparedMeatStockReport.tsx",
  "src/components/SupplierPurchaseReport.tsx",
];

describe("PageSkeleton", () => {
  it("fills the page shell with accessible table skeleton content", () => {
    const { container } = render(
      <PageSkeleton label="正在載入頁面權限" />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("正在載入頁面權限");
    expect(screen.getByRole("table", { hidden: true })).toBeInTheDocument();
    expect(container.querySelectorAll(".table-skeleton-row")).toHaveLength(15);
    expect(container.querySelector(".page-skeleton-panel")).not.toBeNull();
  });

  it("follows the order detail page: heading, three cards, two full-width tables", () => {
    const { container } = render(
      <PageSkeleton label="正在載入訂單詳情" variant="detail" />,
    );

    expect(container.querySelector(".detail-page-skeleton")).not.toBeNull();
    expect(container.querySelector(".detail-skeleton-heading")).not.toBeNull();
    expect(container.querySelector(".detail-skeleton-badge")).not.toBeNull();
    expect(container.querySelector(".detail-grid-two")).toBeNull();
    expect(container.querySelectorAll(".detail-grid .detail-card")).toHaveLength(3);
    expect(container.querySelectorAll(".detail-table-panel")).toHaveLength(2);
    expect(container.querySelectorAll(".table-skeleton-row").length).toBeGreaterThan(8);
  });

  it("follows product and package pages: two cards plus full-width table and copy", () => {
    const { container } = render(
      <PageSkeleton cards={2} label="正在載入商品詳情" variant="detail" />,
    );

    expect(container.querySelector(".detail-grid-two")).not.toBeNull();
    expect(container.querySelectorAll(".detail-grid .detail-card")).toHaveLength(2);
    expect(container.querySelector(".detail-inline-table")).not.toBeNull();
    expect(container.querySelectorAll(".detail-skeleton-copy").length).toBeGreaterThan(0);
  });

  it.each([
    "dashboard",
    "queue",
    "profile",
    "table",
    "report",
    "analysis",
    "detail",
  ] as const)("renders the %s variant through one component", (variant) => {
    const { container } = render(
      <PageSkeleton
        analysis={variant === "report"}
        label={`${variant} loading`}
        variant={variant}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(`${variant} loading`);
    expect(container.querySelectorAll(".page-skeleton-bone").length).toBeGreaterThan(0);
  });

  it.each(SKELETON_PAGES)("is the only page skeleton used by %s", (relativePath) => {
    const source = readFileSync(
      path.resolve(process.cwd(), relativePath),
      "utf8",
    );

    expect(source).toContain(
      'import { PageSkeleton } from "@/components/ui/page-skeleton";',
    );
    expect(source).toContain("<PageSkeleton");
  });
});
