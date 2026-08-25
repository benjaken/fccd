import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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
