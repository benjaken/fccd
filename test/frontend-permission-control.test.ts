import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  hasEffectivePageAccess,
  type PagePermissionValue,
} from "@/auth/use-page-access";

function source(relativePath: string) {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

describe("frontend permission control", () => {
  it("loads every role's grants instead of bypassing permissions by role name", () => {
    const access = source("src/auth/use-page-access.ts");

    expect(access).not.toContain('role === "Super Admin"');
    expect(access).not.toContain("isSuperAdmin");
    expect(access).not.toContain("app_metadata");
    expect(access).toContain('.from("role_page_permissions")');
    expect(access).toContain("return usePageAccess(profile?.role)");
  });

  it("does not let a stale child grant bypass a disabled parent", () => {
    const permissions = new Map<string, PagePermissionValue>([
      [
        "restaurant",
        { canAccess: true, canManage: false, parentPageKey: null },
      ],
      [
        "restaurant.settings",
        {
          canAccess: false,
          canManage: false,
          parentPageKey: "restaurant",
        },
      ],
      [
        "restaurant.settings.delivery_platforms",
        {
          canAccess: true,
          canManage: false,
          parentPageKey: "restaurant.settings",
        },
      ],
    ]);

    expect(
      hasEffectivePageAccess(
        "restaurant.settings.delivery_platforms",
        permissions,
      ),
    ).toBe(false);
    expect(hasEffectivePageAccess("restaurant.settings", permissions)).toBe(
      false,
    );
  });

  it("hides workspace links when every registered child is disabled", () => {
    const permissions = new Map<string, PagePermissionValue>([
      ["workspace", { canAccess: true, canManage: false, parentPageKey: null }],
      [
        "workspace.factory",
        {
          canAccess: true,
          canManage: false,
          parentPageKey: "workspace",
        },
      ],
      [
        "workspace.factory.board",
        {
          canAccess: false,
          canManage: false,
          parentPageKey: "workspace.factory",
        },
      ],
      [
        "workspace.factory.order",
        {
          canAccess: false,
          canManage: false,
          parentPageKey: "workspace.factory",
        },
      ],
      [
        "workspace.factory.meat_delivery_note",
        {
          canAccess: false,
          canManage: false,
          parentPageKey: "workspace.factory",
        },
      ],
      [
        "workspace.factory.multi_day_menu",
        {
          canAccess: false,
          canManage: false,
          parentPageKey: "workspace.factory",
        },
      ],
      [
        "workspace.factory.production_calendar",
        {
          canAccess: false,
          canManage: false,
          parentPageKey: "workspace.factory",
        },
      ],
    ]);

    expect(hasEffectivePageAccess("workspace.factory", permissions)).toBe(
      false,
    );
  });

  it("uses manage grants for editable operational pages", () => {
    const app = source("src/App.tsx");

    for (const grant of [
      'pageAccess.canManage("orders")',
      'pageAccess.canManage("quotes")',
      'pageAccess.canManage("products")',
      'pageAccess.canManage("products.packages")',
      'pageAccess.canManage("delivery")',
      'pageAccess.canManage("orders.payments")',
      'pageAccess.canManage("quotes.customers")',
    ]) {
      expect(app).toContain(grant);
    }
  });

  it("falls back to workspace access until sitemap child permissions exist", () => {
    const access = source("src/auth/use-page-access.ts");
    const app = source("src/App.tsx");

    expect(access).toContain("hasPermission: (pageKey: string)");
    expect(app).toContain("!pageAccess.hasPermission(permissionKey)");
    expect(app).toContain('fallbackPermissionKey="workspace.factory"');
    expect(app).toContain('fallbackPermissionKey="workspace.delivery"');
  });

  it("does not keep legacy role-based edit helpers or locked permission rows", () => {
    expect(source("src/lib/products.ts")).not.toContain(
      "canEditProductCatalog",
    );
    expect(source("src/lib/deliveries.ts")).not.toContain(
      "canAssignDeliveryFleet",
    );
    expect(source("src/lib/settings.ts")).not.toContain(
      "isPagePermissionLocked",
    );
  });
});
