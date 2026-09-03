import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(process.cwd(), "supabase/migrations/20260903070000_enquiry_forms.sql"),
  "utf8",
);

describe("enquiry form migration", () => {
  it("creates public form RPCs for anonymous submit and staff convert", () => {
    expect(sql).toContain("create table if not exists public.enquiry_forms");
    expect(sql).toContain("create table if not exists public.enquiry_submissions");
    expect(sql).toContain("grant execute on function public.get_published_enquiry_form(text) to anon, authenticated;");
    expect(sql).toContain("grant execute on function public.submit_enquiry_form(uuid, jsonb, text, text) to anon, authenticated;");
    expect(sql).toContain("grant execute on function public.convert_enquiry_to_quote(uuid, uuid) to authenticated;");
    expect(sql).toContain("'enquiry_form'");
  });

  it("seeds the default Catering enquiry form with 24 questions", () => {
    expect(sql).toContain("quote-inquiry");
    expect(sql).toContain("FC Catering + Lunch Box 餐飲到會+活動策劃網上查詢");
    expect(sql).toContain("了解條款及政策");
    expect(sql.match(/"field_key":/g)?.length).toBe(24);
  });
});
