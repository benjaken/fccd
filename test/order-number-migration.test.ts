import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("order number standardization migration", () => {
  it("normalizes existing orders and enforces the rule on future writes", () => {
    const migration = readFileSync(
      resolve("supabase/migrations/20260901220000_standardize_order_number_hashes.sql"),
      "utf8",
    );

    expect(migration).toContain("normalized.value ~ '^[0-9]+$'");
    expect(migration).toContain("then '#' || normalized.value");
    expect(migration).toContain("create trigger zz_standardize_order_number");
    expect(migration).toContain("update public.orders");
    expect(migration).toContain("update public.payments as payment");
  });

  it("keeps a typed hash on Catering split numbers such as 7041A", () => {
    const migration = readFileSync(
      resolve("supabase/migrations/20261008120000_keep_catering_split_order_number_hash.sql"),
      "utf8",
    );

    expect(migration).toContain("normalized.had_hash");
    expect(migration).toContain("normalized.value ~ '^[0-9]+[A-Za-z]+$'");
    expect(migration).toContain("btrim(order_number) in ('7041A', '7041B')");
  });
});
