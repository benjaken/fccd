import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DetailPageSkeleton } from "@/components/ui/detail-page-skeleton";

const DETAIL_PAGES = [
  "src/components/OrderDetailPage.tsx",
  "src/components/ProductDetailPage.tsx",
  "src/components/PackageDetailPage.tsx",
];

describe("DetailPageSkeleton", () => {
  it("renders accessible cards and table placeholders", () => {
    const { container } = render(
      <DetailPageSkeleton label="正在載入詳情" cards={2} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("正在載入詳情");
    expect(container.querySelectorAll(".detail-skeleton-card")).toHaveLength(2);
    expect(container.querySelectorAll(".table-skeleton-row")).toHaveLength(6);
    expect(screen.getByRole("table", { hidden: true })).toBeInTheDocument();
  });

  it.each(DETAIL_PAGES)("is used by %s", (relativePath) => {
    const source = readFileSync(
      path.resolve(process.cwd(), relativePath),
      "utf8",
    );

    expect(source).toContain(
      'import { DetailPageSkeleton } from "@/components/ui/detail-page-skeleton";',
    );
    expect(source).toContain("<DetailPageSkeleton");
  });
});
