import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260825153000_sync_catalog_status_and_active.sql",
  ),
  "utf8",
).toLowerCase();

describe("catalog status synchronization migration", () => {
  it("synchronizes product and package status in both directions", () => {
    expect(sql).toContain("create or replace function private.sync_catalog_status_and_active");
    expect(sql).toContain("new.is_active := new.status = 'active'");
    expect(sql).toContain("new.status := case when new.is_active then 'active' else 'inactive' end");
    expect(sql).toContain("before insert or update of status, is_active on public.products");
    expect(sql).toContain("before insert or update of status, is_active on public.packages");
  });

  it("repairs both existing mismatch directions", () => {
    expect(sql).toContain("where status = 'inactive' and is_active");
    expect(sql).toContain("where status = 'active' and not is_active");
  });
});
