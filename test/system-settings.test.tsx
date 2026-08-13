import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { AttachmentsListPage } from "@/components/settings/AttachmentsListPage";
import { RolePermissionsPage } from "@/components/settings/RolePermissionsPage";
import { UsersListPage } from "@/components/settings/UsersListPage";
import i18n from "@/i18n";
import {
  collectAncestorPageKeys,
  collectDescendantPageKeys,
  isValidEmail,
  isValidPassword,
  isValidPhone,
  attachmentFileType,
  type AttachmentListItem,
  type RolePagePermission,
  type UserListItem,
} from "@/lib/settings";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { app_metadata: { role: "Super Admin" } },
    profile: { role: "Super Admin" },
  }),
}));

vi.mock("@/auth/use-page-access", async () => {
  const actual = await vi.importActual<typeof import("@/auth/use-page-access")>(
    "@/auth/use-page-access",
  );
  return {
    ...actual,
    usePageAccess: () => ({
      isSuperAdmin: true,
      loading: false,
      error: null,
      canAccess: () => true,
      canManage: () => true,
      canAccessSection: () => true,
    }),
  };
});

const userItem: UserListItem = {
  id: "user-1",
  email: "admin@example.com",
  userName: "Admin User",
  phone: "+852 9123 4567",
  role: "Super Admin",
  shopRestroLegacyId: "1706068657987x347172380334358500",
  createdAt: "2026-08-12T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
};

const restaurantOptions = [
  {
    legacyId: "1706068657987x347172380334358500",
    name: "TKO 桂花小幸 將軍澳",
    isActive: true,
  },
  {
    legacyId: "1706068652648x839138208709345300",
    name: "YLP 桂花小幸 元朗",
    isActive: true,
  },
];

const loadRestaurants = vi.fn().mockResolvedValue(restaurantOptions);

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
  sourceModifiedAt: "2026-08-10T00:00:00.000Z",
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
    loadRestaurants.mockClear();
    loadRestaurants.mockResolvedValue(restaurantOptions);
  });

  it("renders the paginated user directory", async () => {
    const loadUsers = vi
      .fn()
      .mockResolvedValue({ items: [userItem], total: 24 });

    render(
      <MemoryRouter>
        <UsersListPage
          loadUsers={loadUsers}
          loadRestaurants={loadRestaurants}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "使用者列表" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Admin User")).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText("+852 9123 4567")).toBeInTheDocument();
    expect(await screen.findByText("TKO 桂花小幸 將軍澳")).toBeInTheDocument();
    expect(screen.getByText("顯示 1–15，共 24 筆")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "新建使用者" }),
    ).toBeInTheDocument();
  });

  it("validates create-user fields in the side panel", async () => {
    const user = userEvent.setup();
    const loadUsers = vi
      .fn()
      .mockResolvedValue({ items: [userItem], total: 1 });
    const createUser = vi.fn();

    render(
      <MemoryRouter>
        <UsersListPage
          loadUsers={loadUsers}
          loadRestaurants={loadRestaurants}
          createUser={createUser}
        />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "新建使用者" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "新建使用者" }),
    ).toBeInTheDocument();
    expect(
      await within(dialog).findByRole("combobox", { name: "餐廳識別" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("option", { name: "TKO 桂花小幸 將軍澳" }),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "新建使用者" }));
    expect(await screen.findByText("請輸入使用者名稱。")).toBeInTheDocument();
    expect(screen.getByText("請輸入有效的 Email 格式。")).toBeInTheDocument();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("opens change-password side panel for a listed user", async () => {
    const user = userEvent.setup();
    const loadUsers = vi
      .fn()
      .mockResolvedValue({ items: [userItem], total: 1 });

    render(
      <MemoryRouter>
        <UsersListPage
          loadUsers={loadUsers}
          loadRestaurants={loadRestaurants}
        />
      </MemoryRouter>,
    );

    await user.click(
      await screen.findByRole("button", { name: "修改密碼" }),
    );
    expect(
      await screen.findByRole("heading", { name: "修改密碼" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("為 Admin User 設定新密碼，儲存後即可登入。"),
    ).toBeInTheDocument();
  });

  it("opens edit-user side panel for username and role", async () => {
    const user = userEvent.setup();
    const loadUsers = vi
      .fn()
      .mockResolvedValue({ items: [userItem], total: 1 });

    render(
      <MemoryRouter>
        <UsersListPage
          loadUsers={loadUsers}
          loadRestaurants={loadRestaurants}
        />
      </MemoryRouter>,
    );

    const editButton = await screen.findByRole("button", { name: "編輯" });
    expect(editButton).toHaveClass("size-10");
    expect(editButton).toHaveAccessibleName("編輯");
    expect(editButton).not.toHaveTextContent("編輯");
    expect(
      screen.getByRole("button", { name: "修改密碼" }),
    ).not.toHaveTextContent("修改密碼");

    await user.click(editButton);
    expect(
      await screen.findByRole("heading", { name: "編輯使用者" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("修改 admin@example.com 的名稱與角色。"),
    ).toBeInTheDocument();
    const restaurantSelect = await screen.findByRole("combobox", {
      name: "餐廳識別",
    });
    expect(restaurantSelect).toHaveValue(
      "1706068657987x347172380334358500",
    );
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
    expect(screen.getByRole("heading", { name: "附件列表" })).toBeInTheDocument();
    expect(screen.getByText(/4200/)).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "文件類型" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("PDF").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("文件類型")).toBeInTheDocument();
    expect(screen.getByLabelText("開始日期")).toBeInTheDocument();
    expect(screen.getByLabelText("結束日期")).toBeInTheDocument();
    expect(screen.queryByText("遷移狀態")).not.toBeInTheDocument();
    expect(screen.queryByText("來源")).not.toBeInTheDocument();
    expect(screen.queryByText("所屬資料")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("文件類型"), "pdf");
    await waitFor(() =>
      expect(loadAttachments).toHaveBeenLastCalledWith(
        expect.objectContaining({ fileType: "pdf", page: 1 }),
      ),
    );

    fireEvent.change(screen.getByLabelText("開始日期"), {
      target: { value: "2026-08-01" },
    });
    await waitFor(() =>
      expect(loadAttachments).toHaveBeenLastCalledWith(
        expect.objectContaining({ startDate: "2026-08-01" }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "quote.pdf" }));

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        "https://signed.example/quote.pdf",
        "_blank",
        "noopener,noreferrer",
      ),
    );
  });

  it("locks Super Admin grants and keeps migration reserved", async () => {
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

    const superAdminAccess = await screen.findByRole("switch", {
      name: "使用者列表 可訪問",
    });
    expect(superAdminAccess).toBeChecked();
    expect(superAdminAccess).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("角色"), "Admin");
    expect(
      screen.getByRole("switch", { name: "財務對帳 可訪問" }),
    ).toBeChecked();
    const adminUsers = screen.getByRole("switch", {
      name: "使用者列表 可訪問",
    });
    expect(adminUsers).not.toBeChecked();
    // Settings pages are permission-driven (editable), not hard-locked.
    expect(adminUsers).not.toBeDisabled();
    expect(screen.queryByText("可管理")).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("switch", { name: "訂單 可訪問" }));

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
      screen.getByRole("switch", { name: "待確定訂單 可訪問" }),
    ).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "建立新單 可訪問" }),
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

  it("validates email, Hong Kong phone, and password formats", () => {
    expect(isValidEmail("admin@example.com")).toBe(true);
    expect(isValidEmail("bad-email")).toBe(false);
    expect(isValidPhone("+852 9123 4567")).toBe(true);
    expect(isValidPhone("91234567")).toBe(true);
    expect(isValidPhone("2123 4567")).toBe(true);
    expect(isValidPhone("852-6123-4567")).toBe(true);
    expect(isValidPhone("")).toBe(true);
    expect(isValidPhone("123")).toBe(false);
    expect(isValidPhone("01234567")).toBe(false);
    expect(isValidPhone("+86 138 0000 0000")).toBe(false);
    expect(isValidPassword("Secret123")).toBe(true);
    expect(isValidPassword("short1")).toBe(false);
    expect(
      attachmentFileType({
        mimeType: "application/pdf",
        originalFilename: "quote.pdf",
      }),
    ).toBe("pdf");
    expect(
      attachmentFileType({
        mimeType: "image/jpeg",
        originalFilename: "photo.jpg",
      }),
    ).toBe("image");
    expect(
      attachmentFileType({
        mimeType: "text/csv",
        originalFilename: "export.csv",
      }),
    ).toBe("csv");
  });

  it("renders login logs with event badges", async () => {
    const loadLogs = vi.fn().mockResolvedValue({
      items: [
        {
          id: "log-1",
          eventType: "login_success",
          email: "admin@example.com",
          userId: "user-1",
          userName: "Admin User",
          role: "Super Admin",
          ipAddress: "203.0.113.10",
          userAgent: "Mozilla/5.0",
          errorCode: null,
          createdAt: "2026-08-13T00:00:00.000Z",
        },
      ],
      total: 1,
    });

    const { LoginLogsListPage } = await import(
      "@/components/settings/LoginLogsListPage"
    );

    render(
      <MemoryRouter>
        <LoginLogsListPage loadLogs={loadLogs} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "登入紀錄" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("登入成功").length).toBeGreaterThan(0);
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText("203.0.113.10")).toBeInTheDocument();
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
    const loginLogs = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260813080000_create_login_logs.sql",
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
    expect(loginLogs).toContain("create table public.login_logs");
    expect(loginLogs).toContain("settings.login_logs");
    expect(loginLogs).toContain("Super Admin reads login logs");

    const userActions = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260813090000_user_management_action_permissions.sql",
      ),
      "utf8",
    );
    expect(userActions).toContain("settings.users.create");
    expect(userActions).toContain("settings.users.edit");
    expect(userActions).toContain("settings.users.change_password");

    const permissionDriven = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260813095000_permission_driven_settings_access.sql",
      ),
      "utf8",
    );
    expect(permissionDriven).toContain("private.has_page_access");
    expect(permissionDriven).toContain("private.has_page_manage");
    expect(permissionDriven).toContain("elsif new.page_key = 'migration' then");
    expect(permissionDriven).not.toContain(
      "new.page_key like 'settings.%'",
    );
  });
});
