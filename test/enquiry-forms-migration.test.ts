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

  it("resolves public forms by id and restores 24 seed questions", () => {
    const followUp = readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20260903090000_enquiry_public_id_and_seed_questions.sql"),
      "utf8",
    );
    expect(followUp).toContain("where status = 'published' and id = v_id");
    expect(followUp.match(/"field_key":/g)?.length).toBe(24);
    expect(followUp).toContain("jsonb_array_length(questions) is distinct from 24");
  });

  it("replaces the placeholder seed form id", () => {
    const remap = readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20260903100000_enquiry_seed_form_id.sql"),
      "utf8",
    );
    expect(remap).toContain("0d427475-b85a-4f6f-97c3-0c29b3d28025");
    expect(remap).toContain("11111111-1111-4111-8111-111111111111");
  });

  it("qualifies submit_enquiry_form id to avoid PL/pgSQL 42702", () => {
    const qualify = readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20260903110000_qualify_submit_enquiry_form_id.sql"),
      "utf8",
    );
    expect(qualify).toContain("#variable_conflict use_column");
    expect(qualify).toContain("where enquiry_forms.id = p_form_id and enquiry_forms.status = 'published'");
  });
});
