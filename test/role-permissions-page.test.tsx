import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { RolePermissionsPage } from "@/components/settings/RolePermissionsPage";
import type { RolePagePermission } from "@/lib/settings";

const permissions: RolePagePermission[] = [
  permission("orders", "訂單", null, true, true),
  permission("orders.pending", "待確定訂單", "orders", true, false),
  permission(
    "orders.pending.today",
    "今日待確定",
    "orders.pending",
    true,
    false,
  ),
  permission("orders.payments", "收款紀錄", "orders", false, false),
  permission("quotes", "報價", null, false, false),
];

describe("RolePermissionsPage", () => {
  it("organizes the sitemap into three selectable menu-level columns", async () => {
    render(
      <MemoryRouter>
        <RolePermissionsPage
          loadPermissions={vi.fn().mockResolvedValue(permissions)}
          savePermission={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>,
    );

    const columns = await screen.findAllByRole("region");
    expect(columns).toHaveLength(3);
    const [firstColumn, secondColumn, thirdColumn] = columns;

    expect(document.querySelector(".settings-permission-level-columns"))
      .toBeInTheDocument();
    expect(within(firstColumn).getByRole("button", { name: /訂單/ }))
      .toBeInTheDocument();
    expect(within(secondColumn).getByRole("button", { name: /待確定訂單/ }))
      .toBeInTheDocument();
    expect(within(thirdColumn).getByText("今日待確定"))
      .toBeInTheDocument();
    expect(screen.queryByText("已開放頁面")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "全部收起" }))
      .not.toBeInTheDocument();
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
