import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENQUIRY_ACK_SUBJECT,
  buildEnquiryAckContent,
  buildEnquiryInternalContent,
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
    expect(mail.text).toContain("您好先生陳大文：");
    expect(mail.text).toContain("多謝你填寫「餐飲到會網上查詢」");
    expect(mail.html).toContain("稍後會有專人回覆你");
    expect(mail.html).toContain("聯絡 Food Channels Catering");
    expect(mail.html).not.toContain("聣絡");
    expect(mail.html).not.toContain("/quotes/pending/");
  });

  it("keeps internal mail to mapped fields and the pending detail link", () => {
    const mail = buildEnquiryInternalContent({
      formTitle: "餐飲到會網上查詢",
      referenceCode: "ENQ20260903-TEST",
      customerName: "陳大文",
      salutation: "先生",
      phone: "91234567",
      email: "chan@example.com",
      detailUrl: "https://example.com/quotes/pending/sub-1",
    });
    expect(mail.subject).toBe("新查詢：餐飲到會網上查詢 ENQ20260903-TEST");
    expect(mail.text).toContain("姓名：先生陳大文");
    expect(mail.text).toContain("查看待報價：https://example.com/quotes/pending/sub-1");
    expect(fillEnquiryEmailTemplate("Hi {姓名}", { name: "Ada" })).toBe("Hi Ada");
  });
});
