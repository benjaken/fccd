import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260921250000_customer_service_after_hours_reply_copy.sql",
  "utf8",
);

describe("customer-service after-hours reply copy migration", () => {
  it("states non-office hours and possible delay for no_faq and handoff only", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create schema extensions;
        create table public.customer_service_reply_templates (
          template_key text not null, display_name text not null, content text not null,
          locale text not null default 'zh-HK', enabled boolean not null default true,
          updated_at timestamptz not null default now(),
          primary key (template_key, locale)
        );
        insert into public.customer_service_reply_templates(template_key, display_name, content, locale) values
          ('no_faq', '找不到答案', '舊文案', 'zh-HK'),
          ('handoff', '轉人工', '舊文案', 'zh-HK'),
          ('no_faq', 'Not found', 'old copy', 'en'),
          ('help', '歡迎訊息', '你好', 'zh-HK');
      `);
      await db.exec(migration);

      const rows = await db.query<{ template_key: string; locale: string; content: string }>(
        "select template_key, locale, content from public.customer_service_reply_templates order by template_key, locale",
      );
      const byKey = Object.fromEntries(rows.rows.map((row) => [`${row.template_key}:${row.locale}`, row.content]));
      expect(byKey["no_faq:zh-HK"]).toContain("非辦公時間");
      expect(byKey["no_faq:zh-HK"]).toContain("延遲");
      expect(byKey["handoff:zh-HK"]).toContain("非辦公時間");
      expect(byKey["handoff:zh-HK"]).toContain("延遲");
      expect(byKey["no_faq:en"]).toBe("old copy");
      expect(byKey["help:zh-HK"]).toBe("你好");
    } finally {
      await db.close();
    }
  });
});
