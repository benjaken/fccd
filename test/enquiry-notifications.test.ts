import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENQUIRY_ACK_SUBJECT,
  DEFAULT_ENQUIRY_APP_URL,
  ENQUIRY_INTERNAL_WATI_TEMPLATE,
  buildEnquiryAckContent,
  buildEnquiryInternalContent,
  buildEnquiryInternalWatiParameters,
  enquiryPendingDetailUrl,
  fillEnquiryEmailTemplate,
} from "../supabase/functions/_shared/enquiry-notification-content.ts";

describe("enquiry notification emails", () => {
  it("fills customer acknowledgement copy from the form title and name", () => {
    const mail = buildEnquiryAckContent({
      salutation: "先生",
      name: "陳大文",
      title: "餐飲到會網上查詢",
    });
    expect(mail.subject).toBe(DEFAULT_ENQUIRY_ACK_SUBJECT);
    expect(mail.text).toContain("您好陳大文先生：");
    expect(mail.text).toContain("多謝你填寫「餐飲到會網上查詢」");
    expect(mail.html).toContain("稍後會有專人回覆你");
    expect(mail.html).toContain("聯絡 Food Channels Catering");
    expect(mail.html).not.toContain("聣絡");
    expect(mail.html).not.toContain("tel:");
    expect(mail.html).toContain("(+852) 2185 7373");
    expect(mail.html).toContain('name="format-detection" content="telephone=no"');
    expect(mail.html).not.toContain("/quotes/pending/");
  });

  it("keeps internal mail to mapped fields and the pending detail link", () => {
    const mail = buildEnquiryInternalContent({
      formTitle: "餐飲到會網上查詢",
      referenceCode: "ENQ20260903001",
      customerName: "陳大文",
      salutation: "先生",
      phone: "91234567",
      email: "chan@example.com",
      detailUrl: "https://example.com/quotes/pending/sub-1",
    });
    expect(mail.subject).toBe("新查詢：餐飲到會網上查詢 ENQ20260903001");
    expect(mail.text).toContain("姓名：陳大文先生");
    expect(mail.text).toContain("查看待報價：https://example.com/quotes/pending/sub-1");
    expect(fillEnquiryEmailTemplate("Hi {姓名}", { name: "Ada" })).toBe("Hi Ada");
  });

  it("builds numbered WATI parameters for fccd_enquiry_internal_v1 and uses a dash for blanks", () => {
    expect(ENQUIRY_INTERNAL_WATI_TEMPLATE).toBe("fccd_enquiry_internal_v1");
    const parameters = buildEnquiryInternalWatiParameters({
      formTitle: "餐飲到會網上查詢",
      referenceCode: "ENQ20260903001",
      customerName: "陳大文",
      salutation: "先生",
      phone: "91234567",
      email: "chan@example.com",
      quoteDescription: "公司午餐\n到會",
      detailUrl: "https://example.com/quotes/pending/sub-1",
    });
    expect(parameters).toEqual([
      { name: "1", value: "餐飲到會網上查詢" },
      { name: "2", value: "ENQ20260903001" },
      { name: "3", value: "陳大文先生" },
      { name: "4", value: "-" },
      { name: "5", value: "91234567" },
      { name: "6", value: "chan@example.com" },
      { name: "7", value: "-" },
      { name: "8", value: "-" },
      { name: "9", value: "-" },
      { name: "10", value: "公司午餐 到會" },
      { name: "11", value: "https://example.com/quotes/pending/sub-1" },
    ]);
  });

  it("always builds a pending-quote URL, falling back to the public app host", () => {
    expect(enquiryPendingDetailUrl("", "sub-1")).toBe(
      `${DEFAULT_ENQUIRY_APP_URL}/quotes/pending/sub-1`,
    );
    expect(enquiryPendingDetailUrl("https://app.example.com/", "sub-1")).toBe(
      "https://app.example.com/quotes/pending/sub-1",
    );
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/send-enquiry-notifications/index.ts"),
      "utf8",
    );
    expect(source).toContain("enquiryPendingDetailUrl(Deno.env.get(\"APP_URL\"), row.id)");
  });

  it("does not fail closed when the staging recipient allowlist is missing", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/send-enquiry-notifications/index.ts"),
      "utf8",
    );
    expect(source).toContain("enquiry notification allowlist unavailable");
    expect(source).toContain("enforced: false");
    expect(source).toContain("enquiry internal wati has no recipients");
  });

  it("requires quotes manage permission before force-resending", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/send-enquiry-notifications/index.ts"),
      "utf8",
    );
    expect(source).toContain("if (force && !await callerCanManageQuotes(request, admin))");
    expect(source).toContain('.eq("page_key", "quotes")');
    expect(source).toContain("quotes_manage_required");
  });
});
