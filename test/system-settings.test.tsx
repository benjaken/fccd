import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { AttachmentsListPage } from "@/components/settings/AttachmentsListPage";
import { RolePermissionsPage } from "@/components/settings/RolePermissionsPage";
import { UsersListPage } from "@/components/settings/UsersListPage";
import i18n from "@/i18n";
import {
  collectAncestorPageKeys,
  collectDescendantPageKeys,
  type AttachmentListItem,
  type RolePagePermission,
  type UserListItem,
} from "@/lib/settings";

const userItem: UserListItem = {
  id: "user-1",
  email: "admin@example.com",
  userName: "Admin User",
  role: "Super Admin",
  shopRestroLegacyId: null,
  createdAt: "2026-08-12T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
};

const attachmentItem: AttachmentListItem = {
  id: "attachment-1",
  originalFilename: "quote.pdf",
  sourceType: "bubble_uploaded_file",
  sourceField: "file",
  ownerType: "quote_file",
  ownerLegacyId: "legacy-quote",
  bucketId: "attachments",
  objectPath: "quote/quote.pdf",
  mimeType: "application/pdf",
  sizeBytes: 2048,
  migrationStatus: "verified",
  lastErrorCode: null,
  verifiedAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
};

function permission(
  partial: Partial<RolePagePermission> &
    Pick<RolePagePermission, "role" | "pageKey" | "displayName" | "route">,
): RolePagePermission {
  return {
    parentPageKey: null,
    pageKind: "page",
    sortOrder: 10,
    isHighRisk: false,
    canAccess: false,
    canManage: false,
    depth: 0,
    ...partial,
  };
}

const permissions: RolePagePermission[] = [
  permission({
    role: "Super Admin",
    pageKey: "settings.users",
    parentPageKey: "settings",
    pageKind: "subpage",
    displayName: "使用者列表",
    route: "/settings/users",
    sortOrder: 110,
    isHighRisk: true,
    canAccess: true,
    canManage: true,
    depth: 1,
  }),
  permission({
    role: "Admin",
    pageKey: "orders",
    displayName: "訂單",
    route: "/orders",
    sortOrder: 20,
    canAccess: false,
    canManage: false,
  }),
  permission({
    role: "Admin",
    pageKey: "orders.pending",
    parentPageKey: "orders",
    pageKind: "subpage",
    displayName: "待確定訂單",
    route: "/orders/pending",
    sortOrder: 22,
    canAccess: false,
    canManage: false,
    depth: 1,
  }),
  permission({
    role: "Admin",
    pageKey: "orders.new",
    parentPageKey: "orders",
    pageKind: "subpage",
    displayName: "建立新單",
    route: "/orders/new",
    sortOrder: 21,
    canAccess: false,
    canManage: false,
    depth: 1,
  }),
  permission({
    role: "Admin",
    pageKey: "reports",
    displayName: "報表",
    route: "/reports",
    sortOrder: 90,
    canAccess: false,
    canManage: false,
  }),
  permission({
    role: "Admin",
    pageKey: "reports.shop_order_quantities",
    parentPageKey: "reports",
    pageKind: "tab",
    displayName: "各店訂貨數量",
    route: "/reports/tabs/shop-order-quantities",
    sortOrder: 91,
    canAccess: false,
    canManage: false,
    depth: 1,
  }),
  permission({
    role: "Admin",
    pageKey: "finance",
    displayName: "財務對帳",
    route: "/finance",
    sortOrder: 100,
    isHighRisk: true,
    canAccess: true,
    canManage: false,
  }),
  permission({
    role: "Admin",
    pageKey: "settings.users",
    parentPageKey: "settings",
    pageKind: "subpage",
    displayName: "使用者列表",
    route: "/settings/users",
    sortOrder: 110,
    isHighRisk: true,
    canAccess: false,
    canManage: false,
    depth: 1,
  }),
];

describe("Super Admin system settings", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-HK");
  });

  it("renders the paginated user directory", async () => {
    const loadUsers = vi
      .fn()
      .mockResolvedValue({ items: [userItem], total: 24 });

    render(
      <MemoryRouter>
        <UsersListPage loadUsers={loadUsers} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "使用者列表" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Admin User")).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText("顯示 1–15，共 24 筆")).toBeInTheDocument();
  });

  it("opens a verified private attachment through a signed URL", async () => {
    const user = userEvent.setup();
    const loadAttachments = vi
      .fn()
      .mockResolvedValue({ items: [attachmentItem], total: 4200 });
    const getAttachmentUrl = vi
      .fn()
      .mockResolvedValue("https://signed.example/quote.pdf");
    const open = vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <MemoryRouter>
        <AttachmentsListPage
          loadAttachments={loadAttachments}
          getAttachmentUrl={getAttachmentUrl}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("quote.pdf")).toBeInTheDocument();
    expect(
      screen.getByText("目前附件 registry 共 4200 筆；文件以私人 Storage 保存。"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "開啟附件 quote.pdf" }),
    );

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        "https://signed.example/quote.pdf",
        "_blank",
        "noopener,noreferrer",
      ),
    );
  });

  it("locks Super Admin and reserved setting grants", async () => {
    const user = userEvent.setup();
    const loadPermissions = vi.fn().mockResolvedValue(permissions);
    const savePermission = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <RolePermissionsPage
          loadPermissions={loadPermissions}
          savePermission={savePermission}
        />
      </MemoryRouter>,
    );

    const superAdminAccess = await screen.findByRole("checkbox", {
      name: "使用者列表 可存取",
    });
    expect(superAdminAccess).toBeChecked();
    expect(superAdminAccess).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("角色"), "Admin");
    expect(
      screen.getByRole("checkbox", { name: "財務對帳 可存取" }),
    ).toBeChecked();
    const adminUsers = screen.getByRole("checkbox", {
      name: "使用者列表 可存取",
    });
    expect(adminUsers).not.toBeChecked();
    expect(adminUsers).toBeDisabled();
  });

  it("selecting a parent access grant opens every child page and tab", async () => {
    const user = userEvent.setup();
    const loadPermissions = vi.fn().mockResolvedValue(permissions);
    const savePermission = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <RolePermissionsPage
          loadPermissions={loadPermissions}
          savePermission={savePermission}
        />
      </MemoryRouter>,
    );

    await user.selectOptions(await screen.findByLabelText("角色"), "Admin");
    await user.click(screen.getByRole("checkbox", { name: "訂單 可存取" }));

    await waitFor(() => {
      expect(savePermission).toHaveBeenCalledWith("Admin", "orders", {
        canAccess: true,
        canManage: false,
      });
      expect(savePermission).toHaveBeenCalledWith("Admin", "orders.pending", {
        canAccess: true,
        canManage: true,
      });
      expect(savePermission).toHaveBeenCalledWith("Admin", "orders.new", {
        canAccess: true,
        canManage: true,
      });
    });

    expect(
      screen.getByRole("checkbox", { name: "待確定訂單 可存取" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "建立新單 可存取" }),
    ).toBeChecked();
    expect(screen.getAllByText("子頁面").length).toBeGreaterThan(0);
    expect(screen.getAllByText("分頁").length).toBeGreaterThan(0);
  });

  it("collects descendants and ancestors for cascade updates", () => {
    expect(
      collectDescendantPageKeys("orders", permissions).sort(),
    ).toEqual(["orders", "orders.new", "orders.pending"].sort());
    expect(collectAncestorPageKeys("orders.pending", permissions)).toEqual([
      "orders",
    ]);
  });

  it("enforces the approved policy in the database migration", () => {
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260813025844_create_role_page_permissions.sql",
      ),
      "utf8",
    );
    const hierarchy = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260813060000_hierarchical_role_page_permissions.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("Super Admin reads attachment registry");
    expect(migration).toContain("Super Admin reads private attachment objects");
    expect(migration).toContain(
      "Users read own profile or Super Admin reads all",
    );
    expect(migration).toContain("new.page_key like 'settings.%'");
    expect(migration).toContain("roles.role = 'Super Admin' then true");
    expect(hierarchy).toContain("parent_page_key");
    expect(hierarchy).toContain("page_kind");
    expect(hierarchy).toContain("reports.shop_order_quantities");
    expect(hierarchy).toContain("app_page_descendants");
  });
});
