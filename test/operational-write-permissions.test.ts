import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("operational write permissions", () => {
  it("exposes page management in the role permission table", () => {
    const page = readFileSync(
      path.resolve(process.cwd(), "src/components/settings/RolePermissionsPage.tsx"),
      "utf8",
    );

    expect(page).toContain('settings.roles.columns.manage');
    expect(page).toContain('"canManage"');
    expect(page).toContain('checked={permission.canManage}');
  });

  it("guards operational UI actions with configurable grants", () => {
    const app = readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(app).toContain('pageAccess.canManage("orders.payments")');
    expect(app).toContain('pageAccess.canManage("frozen.prepared_meat_inventory")');
    expect(app).toContain('pageAccess.canManage("frozen.delivery_notes")');
    expect(app).toContain('pageAccess.canAccess("frozen.supplier_quotes.upload")');
    expect(app).toContain('pageAccess.canAccess("frozen.supplier_quotes.review")');
  });

  it("guards RLS and security-definer operational writes", () => {
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260825050000_permission_driven_operational_writes.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("('products', 'products')");
    expect(migration).toContain("('packages', 'products.packages')");
    expect(migration).toContain("private.has_page_manage(%2$L)");
    expect(migration).toContain("private.has_page_manage('orders.payments')");
    expect(migration).toContain("private.has_page_manage('frozen.prepared_meat_inventory')");
    expect(migration).toContain("private.has_page_manage('frozen.delivery_notes')");
    expect(migration).toContain("reconcile_payment_settlement_permission_impl");
    expect(migration).toContain("update_payment_settlement_permission_impl");
    expect(migration).toContain("assign_payment_settlement_invoice_permission_impl");
    expect(migration).toContain("delete_payment_settlement_permission_impl");
    expect(migration).not.toContain("set_config(");
  });
});
