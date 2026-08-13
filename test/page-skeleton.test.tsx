import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageSkeleton } from "@/components/ui/page-skeleton";

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

  it("is the permission-shell loading placeholder", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/App.tsx"),
      "utf8",
    );

    expect(source).toContain(
      '<PageSkeleton label={t("settings.loadingPermissions")} />',
    );
    expect(source).not.toContain(
      '<div className="profile-state" role="status">',
    );
  });
});
