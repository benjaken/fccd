import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("sales document editing permissions", () => {
  it("uses page management grants for order and quote editor routes", () => {
    const app = readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(app).toContain('const canEditOrders = pageAccess.canManage("orders")');
    expect(app).toContain('const canEditQuotes = pageAccess.canManage("quotes")');
    expect(app).not.toContain(
      'authorizationRole === "Super Admin" || authorizationRole === "Admin"',
    );
  });

  it("enforces the same grants in RLS and security-definer RPCs", () => {
    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260825040000_permission_driven_sales_document_editing.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("private.has_sales_document_manage");
    expect(migration).toContain("private.has_page_manage('orders')");
    expect(migration).toContain("private.has_page_manage('quotes')");
    expect(migration).toContain('Document managers update orders');
    expect(migration).toContain(
      "array['order_lines', 'payments', 'deliveries']",
    );
    expect(migration).toContain('Document managers update %1$s');
    expect(migration).toContain('Document managers update order tag assignments');
    expect(migration).not.toContain("auth.jwt() -> 'app_metadata' ->> 'role'");
  });
});
