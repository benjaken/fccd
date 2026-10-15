import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261015012957_restore_customer_service_config_execute.sql",
  ),
  "utf8",
);

describe("customer service config execute grants", () => {
  it("lets signed-in staff list and create config versions", () => {
    expect(sql).toContain(
      "grant execute on function public.customer_service_config_versions_list(text) to authenticated",
    );
    expect(sql).toContain(
      "grant execute on function public.customer_service_config_create_tiered(text, text, text, text, boolean, numeric, text, numeric, integer, boolean, boolean, text, numeric, numeric, integer) to authenticated",
    );
    expect(sql).not.toContain("to anon");
    expect(sql).not.toContain("to public");
  });
});
