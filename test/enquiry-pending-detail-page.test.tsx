import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchEnquirySubmission = vi.fn();
const fetchQuoteBrands = vi.fn();
const saveEnquirySubmissionAnswers = vi.fn();
const convertEnquiryToQuote = vi.fn();
const notifyEnquirySubmission = vi.fn();

vi.mock("@/lib/enquiry-forms-api", () => ({
  fetchEnquirySubmission: (...args: unknown[]) => fetchEnquirySubmission(...args),
  saveEnquirySubmissionAnswers: (...args: unknown[]) => saveEnquirySubmissionAnswers(...args),
  convertEnquiryToQuote: (...args: unknown[]) => convertEnquiryToQuote(...args),
  notifyEnquirySubmission: (...args: unknown[]) => notifyEnquirySubmission(...args),
}));

vi.mock("@/lib/quotes", () => ({
  fetchQuoteBrands: (...args: unknown[]) => fetchQuoteBrands(...args),
}));

import { EnquiryPendingDetailPage } from "@/components/EnquiryPendingDetailPage";

const submission = {
  id: "sub-1",
  referenceCode: "ENQ20260903-884c8c",
  formId: "form-1",
  createdAt: "2026-09-03T02:00:00.000Z",
  formTitle: "FC Catering Enquiry",
  customerName: "sing",
  salutation: "先生",
  companyName: "www.winepassions.com",
  phone: "95588228",
  email: "cfb.app02@chifung.net",
  deliveryDateRaw: "2026-10-01",
  quoteDescription: "公司午餐到會",
  headcount: "80",
  internalEmailStatus: "not_sent",
  internalWatiStatus: "not_sent",
  ackEmailStatus: "not_sent",
  asanaStatus: "not_created",
  asanaLink: "",
  formSnapshot: [
    { fieldKey: "name", type: "input" as const, title: "姓名", required: true, quoteField: "customer_name" as const },
    {
      fieldKey: "title",
      type: "radio" as const,
      title: "稱謂",
      required: true,
      quoteField: "salutation" as const,
      options: [
        { label: "先生", value: "先生" },
        { label: "小姐", value: "小姐" },
      ],
    },
    { fieldKey: "company", type: "input" as const, title: "公司/機構名稱", required: false, quoteField: "company_name" as const },
  ],
  answers: { name: "sing", title: "先生", company: "www.winepassions.com" },
  originalAnswers: { name: "sing", title: "先生", company: "www.winepassions.com" },
  convertedQuoteId: null,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/quotes/pending/sub-1?nav=catering.quotes"]}>
      <Routes>
        <Route
          path="/quotes/pending/:id"
          element={<EnquiryPendingDetailPage canManage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("EnquiryPendingDetailPage", () => {
  beforeEach(() => {
    fetchEnquirySubmission.mockReset();
    fetchQuoteBrands.mockReset();
    saveEnquirySubmissionAnswers.mockReset();
    convertEnquiryToQuote.mockReset();
    notifyEnquirySubmission.mockReset();
    fetchEnquirySubmission.mockResolvedValue(submission);
    fetchQuoteBrands.mockResolvedValue([{ id: "brand-1", name: "Catering" }]);
  });

  it("uses the quote editor heading, step tabs and two-column details form", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "ENQ20260903-884c8c" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回待報價列表" })).toHaveAttribute(
      "href",
      "/quotes/pending?nav=catering.quotes",
    );
    expect(screen.getByText("待轉報價")).toHaveClass("eyebrow");
    expect(document.querySelector(".quote-editor-page")).not.toBeNull();
    expect(document.querySelector(".quote-editor-tabs.has-enquiry")).not.toBeNull();
    expect(screen.getByRole("tab", { name: "客戶查詢資料" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "報價資料" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "加入貨品" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "客戶查詢資料" })[0]).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "客戶資料" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "配送與備註" })).toBeInTheDocument();
    expect(screen.getByText("轉成報價單後即可加入貨品。")).toBeInTheDocument();
    expect(document.querySelector(".enquiry-form-fields-split")).not.toBeNull();
    expect(document.querySelector(".quote-editor-form")).not.toBeNull();
    expect(screen.queryByRole("link", { name: "返回列表" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "儲存修改" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "轉成報價單" })).toHaveClass("border");
    expect(screen.getByRole("button", { name: "儲存修改" }).closest("footer")).toContainElement(
      screen.getByRole("button", { name: "轉成報價單" }),
    );
    expect(screen.getAllByDisplayValue("sing").length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue("www.winepassions.com").length).toBeGreaterThan(0);
  });
});
