import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("restaurant workspace permissions", () => {
  it("sets editable defaults without installing a hard-coded role gate", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260905193000_restrict_restaurant_workspace_roles.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("update public.role_page_permissions");
    expect(migration).toContain("'Super Admin', 'Admin', 'Shop manager'");
    expect(migration).toContain("page_key = 'workspace.restaurant'");
    expect(migration).not.toContain("create or replace function");
    expect(migration).not.toContain("enforce_reserved_page_permissions");
  });
});
