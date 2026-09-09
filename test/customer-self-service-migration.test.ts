import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260827200000_customer_self_service_portal.sql"),
  "utf8",
);

describe("customer self-service portal migration", () => {
  it("keeps customer data behind short-lived, hashed sessions", () => {
    expect(sql).toContain("private.customer_self_service_sessions");
    expect(sql).toContain("expires_at timestamptz not null default now() + interval '30 minutes'");
    expect(sql).toContain("digest(v_phone, 'sha256')");
    expect(sql).toContain("digest(v_email, 'sha256')");
    expect(sql).toContain("private.self_service_order_matches");
  });

  it("requires both phone and email and rate limits lookups", () => {
    expect(sql).toContain("session.phone_hash = v_phone_hash");
    expect(sql).toContain("session.email_hash = v_email_hash");
    expect(sql).toContain("count(*) >= 5");
    expect(sql).toMatch(/lower\(btrim\(coalesce\(orders\.email_snapshot, ''\)\)\) = v_email[\s\S]*self_service_phone\(orders\.contact_number_a_snapshot\) = v_phone/);
  });

  it("exposes only the guarded RPCs to anonymous customers", () => {
    expect(sql).toContain("revoke all on private.customer_self_service_sessions from public, anon, authenticated");
    expect(sql).toContain("security definer");
    expect(sql).toContain("grant execute on function public.customer_self_service_login(text, text) to anon, authenticated");
    expect(sql).toContain("grant execute on function public.customer_self_service_order_detail(uuid, uuid) to anon, authenticated");
  });
});

describe("customer self-service catalog product name", () => {
  it("prefers live 產品名稱 over the order-line snapshot", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260903090526_prefer_catalog_product_name_on_self_service.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("nullif(btrim(product.name), '')");
    expect(sql).toContain("nullif(btrim(package.name), '')");
    expect(sql).toMatch(
      /coalesce\(\s*nullif\(btrim\(product\.name\), ''\),\s*nullif\(btrim\(package\.name\), ''\),\s*nullif\(btrim\(line\.product_name_snapshot\), ''\)/,
    );
    expect(sql).not.toContain(
      "coalesce(nullif(btrim(line.product_name_snapshot), ''), product.name, package.name, line.content_snapshot, 'Item')",
    );
  });
});

describe("customer self-service receipt data", () => {
  it("exposes the same shipping and brand fields used by the order REC", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260909120000_self_service_receipt_matches_order_rec.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("'shippingFee', coalesce(v_order.shipping_fee, 0)");
    expect(sql).toContain("'deliveryTime', coalesce(v_order.delivery_time, v_order.ship_out_time)");
    expect(sql).toContain("'shopifyStoreDomain'");
    expect(sql).toContain("store.shop_domain");
    expect(sql).toContain("private.self_service_order_matches");
  });

  it("exposes the order discount used by the self-service receipt", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260909130000_expose_self_service_order_discount.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("'discount', coalesce(v_order.discount_amount, 0)");
    expect(sql).toContain("private.self_service_order_matches");
  });
});
