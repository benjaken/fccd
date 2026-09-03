import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { EnquiryPendingListPage } from "@/components/EnquiryPendingListPage";
import type { EnquirySubmissionListItem } from "@/lib/enquiry-forms-api";

const submissions: EnquirySubmissionListItem[] = [
  {
    id: "sub-1",
    createdAt: "2026-09-03T02:00:00.000Z",
    formTitle: "FC Catering Enquiry",
    customerName: "陳大文",
    salutation: "先生",
    companyName: "示例企業",
    phone: "91234567",
    email: "chan@example.com",
    deliveryDateRaw: "2026-10-01",
    quoteDescription: "公司午餐到會",
    headcount: "80",
    internalEmailStatus: "not_sent",
    ackEmailStatus: "not_sent",
    asanaStatus: "not_created",
    asanaLink: "",
  },
];

describe("EnquiryPendingListPage", () => {
  it("renders pending enquiries in the shared table", async () => {
    render(
      <MemoryRouter>
        <EnquiryPendingListPage loadSubmissions={async () => submissions} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("先生陳大文")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "建立時間" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "客戶" })).toBeInTheDocument();
    expect(screen.getByText("公司午餐到會")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /2026/ })).toHaveAttribute(
      "href",
      "/quotes/pending/sub-1",
    );
  });

  it("reloads from the server when searching", async () => {
    const loadSubmissions = vi.fn(async (keyword = "") =>
      keyword ? [] : submissions,
    );
    render(
      <MemoryRouter>
        <EnquiryPendingListPage loadSubmissions={loadSubmissions} />
      </MemoryRouter>,
    );
    await screen.findByText("先生陳大文");
    await userEvent.type(screen.getByRole("searchbox", { name: "搜尋待報價" }), "沒有這筆");
    expect(await screen.findByText("暫無待報價查詢")).toBeInTheDocument();
    await waitFor(() => expect(loadSubmissions).toHaveBeenLastCalledWith("沒有這筆"));
  });
});
