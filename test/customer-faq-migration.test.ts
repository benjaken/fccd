import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260904120000_whatsapp_customer_service_faq.sql"),
  "utf8",
);

const [publishedSeed = "", unpublishedSeed = ""] = sql.split("-- unpublished blocked seed");

describe("WhatsApp customer-service FAQ migration", () => {
  it("adds FAQ, inbound audit, conversation state, and a default-off bot switch", () => {
    expect(sql).toContain("create extension if not exists pg_trgm");
    expect(sql).toContain("create table if not exists public.customer_faqs");
    expect(sql).toContain("create table if not exists public.customer_service_inbound_events");
    expect(sql).toContain("create table if not exists public.customer_service_conversations");
    expect(sql).toContain("create table if not exists public.customer_service_controls");
    expect(sql).toContain("bot_enabled boolean not null default false");
    expect(sql).toContain("'identifying'");
    expect(sql).toContain("'picking_order'");
    expect(sql).toContain("'collecting'");
    expect(sql).toContain("'human_owned'");
    expect(sql).toContain("'whatsapp'::text");
  });

  it("does not rewrite outbound WATI notification controls", () => {
    expect(sql).toContain("Does not alter wati_notification_controls");
    expect(sql).not.toMatch(/alter table[\s\S]{0,80}wati_notification_controls/i);
    expect(sql).not.toContain("update public.wati_notification_controls");
    expect(sql).not.toContain("wati_notification_control_set");
    expect(sql).not.toContain("wati_notification_controls_get");
  });

  it("indexes published FAQ text for keyword and trigram search", () => {
    expect(sql).toContain("using gin (question gin_trgm_ops)");
    expect(sql).toContain("using gin (keywords gin_trgm_ops)");
    expect(sql).toContain("where is_published");
  });

  it("keeps FAQ text and inbound events away from anon", () => {
    expect(sql).toContain("revoke all on table public.customer_faqs from public, anon");
    expect(sql).toContain(
      "revoke all on table public.customer_service_inbound_events from public, anon, authenticated",
    );
    expect(sql).toContain(
      "revoke all on table public.customer_service_conversations from public, anon, authenticated",
    );
    expect(sql).toContain(
      "revoke all on function public.search_published_customer_faqs(text, integer) from public, anon",
    );
    expect(sql).not.toContain(
      "grant execute on function public.search_published_customer_faqs(text, integer) to anon",
    );
  });

  it("registers FAQ maintenance pages for Super Admin and Admin only", () => {
    expect(sql).toContain("'settings.customer_faq'");
    expect(sql).toContain("'settings.customer_faq.edit'");
    expect(sql).toContain("'/settings/customer-faq'");
    expect(sql).toContain("private.has_page_access('settings.customer_faq')");
    expect(sql).toContain("private.has_page_access('settings.customer_faq.edit')");
    expect(sql).toContain("roles.role in ('Super Admin', 'Admin')");
  });

  it("searches only published FAQ rows with a similarity floor", () => {
    expect(sql).toContain("create or replace function public.search_published_customer_faqs(");
    expect(sql).toMatch(/where faq\.is_published[\s\S]*similarity\(faq\.question, v_query\) >= 0\.12/);
    expect(sql).toContain("grant execute on function public.search_published_customer_faqs(text, integer) to authenticated, service_role");
  });

  it("seeds the published shipping table and blocks prices, tokens, and dated codes", () => {
    expect(sql).not.toContain("\ufffd");
    expect(publishedSeed).toContain("運費幾多？");
    expect(publishedSeed).toContain("HK$50");
    expect(publishedSeed).toContain("HK$2800");
    expect(publishedSeed).toContain("HK$200");
    expect(publishedSeed).toContain("self_service_search");
    expect(publishedSeed).not.toContain("747-221000");
    expect(publishedSeed).not.toContain("HSBC2024");
    expect(publishedSeed).not.toContain("HK$800");
    expect(publishedSeed).not.toContain("HK$30");
    expect(unpublishedSeed).toContain("747-221000");
    expect(unpublishedSeed).toContain("HSBC2024");
    expect(unpublishedSeed).toContain("HK$800");
    expect(unpublishedSeed).toContain("HK$30");
    expect(unpublishedSeed).toContain("false");
    expect(unpublishedSeed).not.toContain("true");
  });
});
