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
    const result = { items: [attachmentItem], total: 4200 };
    let resolveAttachments: ((value: typeof result) => void) | null = null;
    const loadAttachments = vi.fn().mockImplementationOnce(
      () =>
        new Promise<typeof result>((resolve) => {
          resolveAttachments = resolve;
        }),
    );
    loadAttachments.mockResolvedValue(result);
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

    expect(document.querySelectorAll(".table-skeleton-row")).toHaveLength(15);
    expect(screen.getByRole("table").parentElement).toHaveClass(
      "settings-attachments-table",
    );
    expect(screen.getByRole("table").parentElement).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByRole("status")).toHaveTextContent("正在載入附件…");

    resolveAttachments?.(result);

    expect(await screen.findByText("quote.pdf")).toBeInTheDocument();
    expect(document.querySelectorAll(".table-skeleton-row")).toHaveLength(0);
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

    await user.click(await screen.findByRole("button", { name: "quote.pdf" }));

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
    expect(
      screen.queryByText("Super Admin 固定可訪問所有頁面。"),
    ).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText("當前查看角色"),
      "Admin",
    );
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

    await user.selectOptions(
      await screen.findByLabelText("當前查看角色"),
      "Admin",
    );
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

    const passwordChangeLog = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260813100000_login_log_password_change.sql",
      ),
      "utf8",
    );
    expect(passwordChangeLog).toContain("'password_change'");
    expect(
      readFileSync(
        path.resolve(process.cwd(), "supabase/functions/login-log/index.ts"),
        "utf8",
      ),
    ).toContain('rpc("record_login_log"');
    expect(
      readFileSync(
        path.resolve(
          process.cwd(),
          "supabase/migrations/20260813110000_merge_duplicate_login_success.sql",
        ),
        "utf8",
      ),
    ).toContain("create or replace function public.record_login_log");
    expect(
      readFileSync(
        path.resolve(process.cwd(), "supabase/functions/admin-users/index.ts"),
        "utf8",
      ),
    ).toContain('event_type: "password_change"');

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

    const reportGroups = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814120000_report_group_page_permissions.sql",
      ),
      "utf8",
    );
    expect(reportGroups).toContain("reports.frozen_meat");
    expect(reportGroups).toContain("reports.shops");
    expect(reportGroups).toContain("parent_page_key = 'reports.frozen_meat'");
    expect(reportGroups).toContain("parent_page_key = 'reports.shops'");

    const frozenActions = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814142000_frozen_list_action_permissions.sql",
      ),
      "utf8",
    );
    expect(frozenActions).toContain("frozen.seasoning_cost.edit");
    expect(frozenActions).toContain("frozen.seasoning_cost.delete");
    expect(frozenActions).toContain("frozen.meat_customers.edit");
    expect(frozenActions).toContain("frozen.meat_customers.delete");
    expect(frozenActions).toContain("frozen.spice_usage.delete");
    expect(frozenActions).toContain("frozen.calculation_settings.delete");

    const sellingPriceCost = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814170000_frozen_selling_price_cost_page_permissions.sql",
      ),
      "utf8",
    );
    expect(sellingPriceCost).toContain("frozen.selling_price_cost");
    expect(sellingPriceCost).toContain("售價成本計算");
    expect(sellingPriceCost).toContain("/frozen/selling-price-cost");
    expect(sellingPriceCost).toContain("roles.role in ('Admin', 'Factory')");
    expect(frozenActions).toContain("roles.role = 'Super Admin'");

    const sellingPricePush = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260817010000_selling_price_cost_push_permission.sql",
      ),
      "utf8",
    );
    expect(sellingPricePush).toContain("frozen.selling_price_cost.push");
    expect(sellingPricePush).toContain("推送月報售價");
    expect(sellingPricePush).toContain("push_monthly_meat_prices");
    expect(sellingPricePush).toContain("year month is required");
    expect(sellingPricePush).toContain(
      "drop trigger if exists refresh_monthly_meat_prices_raw_stock",
    );

    const preparedMeatInventory = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814183000_frozen_prepared_meat_inventory_page_permissions.sql",
      ),
      "utf8",
    );
    expect(preparedMeatInventory).toContain("frozen.prepared_meat_inventory");
    expect(preparedMeatInventory).toContain("製成品存貨計算");
    expect(preparedMeatInventory).toContain("/frozen/prepared-meat-inventory");
    expect(preparedMeatInventory).toContain("roles.role in ('Admin', 'Factory')");

    const deliveryNotesPage = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814204000_frozen_delivery_notes_page.sql",
      ),
      "utf8",
    );
    expect(deliveryNotesPage).toContain("frozen.delivery_notes");
    expect(deliveryNotesPage).toContain("送貨單管理");
    expect(deliveryNotesPage).toContain("/frozen/delivery-notes");
    expect(deliveryNotesPage).toContain("delete_meat_delivery_note");
    expect(deliveryNotesPage).toContain("roles.role in ('Admin', 'Factory')");

    const deliveryListSupport = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260817061000_delivery_list_support.sql",
      ),
      "utf8",
    );
    expect(deliveryListSupport).toContain("orders.shipping_method_id");
    expect(deliveryListSupport).toContain("deliveries.delivery_time");
    expect(deliveryListSupport).toContain("Operations read delivery surcharges");
    expect(deliveryListSupport).toContain("'Factory'");

    const deliveryListRowEdits = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260817062000_delivery_list_row_edits.sql",
      ),
      "utf8",
    );
    expect(deliveryListRowEdits).toContain("orders.delivery_time");
    expect(deliveryListRowEdits).toContain("assign_delivery_motorcade");
    expect(deliveryListRowEdits).toContain("'Factory'");

    const cancelPendingDelivery = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260817063000_cancel_pending_delivery.sql",
      ),
      "utf8",
    );
    expect(cancelPendingDelivery).toContain("cancel_pending_delivery");
    expect(cancelPendingDelivery).toContain("待取貨");
    expect(cancelPendingDelivery).toContain("'Factory'");

    const frozenMenuLabels = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814206000_frozen_menu_labels_and_selling_price_order.sql",
      ),
      "utf8",
    );
    expect(frozenMenuLabels).toContain("客戶管理");
    expect(frozenMenuLabels).toContain("收成錯誤統計");
    expect(frozenMenuLabels).toContain("frozen.selling_price_cost");
    expect(frozenMenuLabels).toContain("frozen.prepared_meat_inventory");

    const orderStatusSettings = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260817040000_order_status_settings_page.sql",
      ),
      "utf8",
    );
    expect(orderStatusSettings).toContain("orders.settings");
    expect(orderStatusSettings).toContain("orders.settings.statuses");
    expect(orderStatusSettings).toContain("orders.settings.statuses.create");
    expect(orderStatusSettings).toContain("orders.settings.statuses.edit");
    expect(orderStatusSettings).toContain("orders.settings.statuses.delete");
    expect(orderStatusSettings).toContain("archive_order_status");
    expect(orderStatusSettings).toContain("private.has_page_access");

    const orderSalePartners = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260817050000_orders_sale_partners_page.sql",
      ),
      "utf8",
    );
    expect(orderSalePartners).toContain("orders.settings.sale_partners");
    expect(orderSalePartners).toContain("/orders/settings/sale-partners");
    expect(orderSalePartners).toContain("archive_sales_partner");
    expect(orderSalePartners).toContain(
      "Sale partner readers select sales partners",
    );

    const preparedMeatFlags = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814184000_update_prepared_meat_item_flags.sql",
      ),
      "utf8",
    );
    expect(preparedMeatFlags).toContain("update_prepared_meat_item_flags");
    expect(preparedMeatFlags).toContain("frozen.prepared_meat_inventory");

    const preparedMeatOutbound = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814185000_create_prepared_meat_outbound.sql",
      ),
      "utf8",
    );
    expect(preparedMeatOutbound).toContain("create_prepared_meat_outbound");
    expect(preparedMeatOutbound).toContain("桂花小幸");

    const preparedMeatOutboundConfirm = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814190000_prepared_meat_outbound_confirm_and_raw.sql",
      ),
      "utf8",
    );
    expect(preparedMeatOutboundConfirm).toContain("send_prepared_meat_order_to_factory");
    expect(preparedMeatOutboundConfirm).toContain("can_ship_directly");
    expect(preparedMeatOutboundConfirm).toContain("到會");
    expect(preparedMeatOutboundConfirm).toContain("凍肉製作");

    const createPreparedMeatItemSql = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814191000_create_prepared_meat_item.sql",
      ),
      "utf8",
    );
    expect(createPreparedMeatItemSql).toContain("create_prepared_meat_item");
    expect(createPreparedMeatItemSql).toContain("kg_per_package");
    expect(createPreparedMeatItemSql).toContain("frozen.prepared_meat_inventory");

    const savePreparedMeatOutbound = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814192000_save_prepared_meat_outbound.sql",
      ),
      "utf8",
    );
    expect(savePreparedMeatOutbound).toContain("save_prepared_meat_outbound");
    expect(savePreparedMeatOutbound).toContain("p_contact_person");
    expect(savePreparedMeatOutbound).toContain("p_order_id");

    const preparedMeatOutboundStock = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814193000_prepared_meat_outbound_stock_limits.sql",
      ),
      "utf8",
    );
    expect(preparedMeatOutboundStock).toContain(
      "prepared_meat_outbound_stock_balances",
    );
    expect(preparedMeatOutboundStock).toContain("quantity exceeds current stock");
    expect(preparedMeatOutboundStock).toContain(
      "where prepared_meat_item_id is not null",
    );
    expect(preparedMeatOutboundStock).toContain(
      "where raw_meat_item_id is not null",
    );

    const preparedMeatOutboundStockNullItems = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814203000_prepared_meat_outbound_stock_ignore_null_items.sql",
      ),
      "utf8",
    );
    expect(preparedMeatOutboundStockNullItems).toContain(
      "prepared_meat_outbound_stock_balances",
    );
    expect(preparedMeatOutboundStockNullItems).toContain(
      "where prepared_meat_item_id is not null",
    );
    expect(preparedMeatOutboundStockNullItems).toContain(
      "where raw_meat_item_id is not null",
    );

    const preparedMeatInboundNoRaw = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814194000_create_prepared_meat_inbound_no_raw.sql",
      ),
      "utf8",
    );
    expect(preparedMeatInboundNoRaw).toContain("create_prepared_meat_inbound_no_raw");
    expect(preparedMeatInboundNoRaw).toContain("inbound_packages");
    expect(preparedMeatInboundNoRaw).toContain("frozen.prepared_meat_inventory");
    expect(preparedMeatInboundNoRaw).not.toContain(
      "prepared_meat_stock_raw_sources",
    );

    const preparedMeatInboundNoRawFilter = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814202000_prepared_meat_inbound_no_raw_without_raw_item.sql",
      ),
      "utf8",
    );
    expect(preparedMeatInboundNoRawFilter).toContain(
      "prepared meat item requires raw meat",
    );
    expect(preparedMeatInboundNoRawFilter).not.toContain(
      "prepared_meat_stock_raw_sources",
    );

    const preparedMeatInboundWithRaw = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814195000_create_prepared_meat_inbound_with_raw.sql",
      ),
      "utf8",
    );
    expect(preparedMeatInboundWithRaw).toContain(
      "create_prepared_meat_inbound_with_raw",
    );
    expect(preparedMeatInboundWithRaw).toContain(
      "prepared_meat_inbound_raw_preview",
    );
    expect(preparedMeatInboundWithRaw).toContain("prepared_meat_stock_raw_sources");
    expect(preparedMeatInboundWithRaw).toContain(
      "inbound quantity must be within 50 percent of budgeted yield",
    );

    const yieldErrors = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814210000_frozen_yield_errors_page_permissions.sql",
      ),
      "utf8",
    );
    expect(yieldErrors).toContain("frozen.yield_errors");
    expect(yieldErrors).toContain("收成錯誤");
    expect(yieldErrors).toContain("/frozen/yield-errors");
    expect(yieldErrors).toContain(
      "roles.role in ('Admin', 'Factory', 'Accounting')",
    );

    const yieldExceptions = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814250000_rename_yield_errors_to_exceptions.sql",
      ),
      "utf8",
    );
    expect(yieldExceptions).toContain("frozen.yield_errors");
    expect(yieldExceptions).toContain("收成異常");

    const yieldErrorStatistics = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814260000_rename_yield_exceptions_to_error_statistics.sql",
      ),
      "utf8",
    );
    expect(yieldErrorStatistics).toContain("frozen.yield_errors");
    expect(yieldErrorStatistics).toContain("收成錯誤統計");

    const yieldExceptionStatistics = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260817020000_rename_yield_errors_to_exception_statistics.sql",
      ),
      "utf8",
    );
    expect(yieldExceptionStatistics).toContain("frozen.yield_errors");
    expect(yieldExceptionStatistics).toContain("收成異常統計");

    const rawMeatActions = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260814160000_raw_meat_option_and_stock_in.sql",
      ),
      "utf8",
    );
    expect(rawMeatActions).toContain("frozen.raw_meat_inventory.create");
    expect(rawMeatActions).toContain("frozen.raw_meat_inventory.edit");
    expect(rawMeatActions).toContain("frozen.raw_meat_inventory.stock_in");
    expect(rawMeatActions).toContain("create_raw_meat_item");
    expect(rawMeatActions).toContain("create_raw_meat_stock_in");
  });
});
