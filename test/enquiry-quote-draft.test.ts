import { describe, expect, it } from "vitest";

import { quoteDraftFromEnquiry } from "@/lib/enquiry-quote-draft";

describe("quoteDraftFromEnquiry", () => {
  it("copies mapped enquiry answers into the quote draft", () => {
    const draft = quoteDraftFromEnquiry({
      id: "sub-1",
      referenceCode: "ENQ1",
      formId: "form-1",
      createdAt: "2026-09-03T00:00:00.000Z",
      formTitle: "Enquiry",
      customerName: "Ada",
      salutation: "小姐",
      companyName: "ACME",
      phone: "91234567",
      email: "ada@example.com",
      deliveryDateRaw: "2026-10-01",
      quoteDescription: "午餐",
      headcount: "20",
      internalEmailStatus: "sent",
      internalWatiStatus: "sent",
      ackEmailStatus: "sent",
      asanaStatus: "created",
      asanaLink: "https://app.asana.com/0/1/2",
      formSnapshot: [
        { fieldKey: "name", type: "input", title: "姓名", required: true, quoteField: "customer_name" },
        { fieldKey: "company", type: "input", title: "公司", required: false, quoteField: "company_name" },
        { fieldKey: "phone", type: "input", title: "電話", required: true, quoteField: "phone" },
        { fieldKey: "email", type: "input", title: "電郵", required: true, quoteField: "email" },
        { fieldKey: "date", type: "date", title: "日期", required: false, quoteField: "delivery_date" },
        { fieldKey: "headcount", type: "input", title: "人數", required: false, quoteField: "headcount" },
        { fieldKey: "note", type: "textarea", title: "描述", required: false, quoteField: "quote_description" },
      ],
      answers: {
        name: "Ada",
        company: "ACME",
        phone: "91234567",
        email: "ada@example.com",
        date: "2026-10-01",
        headcount: "20",
        note: "午餐",
      },
      originalAnswers: {},
      convertedQuoteId: null,
    });

    expect(draft).toMatchObject({
      customerName: "Ada",
      companyName: "ACME",
      contactA: "91234567",
      email: "ada@example.com",
      asanaLink: "https://app.asana.com/0/1/2",
      deliveryDate: "2026-10-01",
      customerNote: "午餐",
      packingNote: "人數：20",
    });
  });
});
