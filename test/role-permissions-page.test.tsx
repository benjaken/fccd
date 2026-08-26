import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { RolePermissionsPage } from "@/components/settings/RolePermissionsPage";
import type { RolePagePermission } from "@/lib/settings";

const permissions: RolePagePermission[] = [
  permission("orders", "訂單", null, true, true),
  permission("orders.pending", "待確定訂單", "orders", true, false),
  permission("orders.payments", "收款紀錄", "orders", false, false),
  permission("quotes", "報價", null, false, false),
];

describe("RolePermissionsPage", () => {
  it("organizes the sitemap into separate sections with access summaries", async () => {
    render(
      <MemoryRouter>
        <RolePermissionsPage
          loadPermissions={vi.fn().mockResolvedValue(permissions)}
          savePermission={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("訂單")).toBeInTheDocument();

    const grid = document.querySelector(".settings-permission-grid");
    expect(grid).toBeInTheDocument();
    expect(grid?.querySelectorAll(".settings-permission-section")).toHaveLength(2);
    expect(
      grid?.querySelectorAll(".settings-permission-section-stat"),
    ).toHaveLength(4);
    expect(screen.getByText("報價")).toBeInTheDocument();
  });
});

function permission(
  pageKey: string,
  displayName: string,
  parentPageKey: string | null,
  canAccess: boolean,
  canManage: boolean,
): RolePagePermission {
  return {
    role: "Super Admin",
    pageKey,
    parentPageKey,
    pageKind: parentPageKey ? "subpage" : "page",
    displayName,
    route: `/${pageKey.replaceAll(".", "/")}`,
    sortOrder: pageKey === "orders" ? 1 : pageKey === "quotes" ? 2 : 3,
    isHighRisk: false,
    canAccess,
    canManage,
    depth: 0,
  };
}
