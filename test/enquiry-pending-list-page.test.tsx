import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { EnquiryPendingListPage } from "@/components/EnquiryPendingListPage";
import type { EnquirySubmissionListItem } from "@/lib/enquiry-forms-api";

const submissions: EnquirySubmissionListItem[] = [
  {
    id: "sub-1",
    referenceCode: "ENQ20260903-884c8c",
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
    internalWatiStatus: "not_sent",
    ackEmailStatus: "not_sent",
    asanaStatus: "not_created",
    asanaLink: "",
  },
];

describe("EnquiryPendingListPage", () => {
  it("renders pending enquiries in the shared table", async () => {
    render(
      <MemoryRouter>
        <EnquiryPendingListPage canManage loadSubmissions={async () => submissions} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("先生陳大文")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "查詢單號" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "內部 WhatsApp" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "建立時間" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "客戶" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "描述" })).not.toBeInTheDocument();
    expect(screen.queryByText("公司午餐到會")).not.toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ENQ20260903-884c8c" })).toHaveClass("order-link");
    expect(screen.getByRole("link", { name: "ENQ20260903-884c8c" })).toHaveAttribute(
      "href",
      "/quotes/pending/sub-1",
    );
    expect(document.querySelector(".quotes-toolbar .list-search")).not.toBeNull();
  });

  it("reloads from the server when searching", async () => {
    const loadSubmissions = vi.fn(async (keyword = "") =>
      keyword ? [] : submissions,
    );
    render(
      <MemoryRouter>
        <EnquiryPendingListPage canManage loadSubmissions={loadSubmissions} />
      </MemoryRouter>,
    );
    await screen.findByText("先生陳大文");
    await userEvent.type(screen.getByRole("searchbox", { name: "搜尋待報價" }), "沒有這筆");
    expect(await screen.findByText("暫無待報價查詢")).toBeInTheDocument();
    await waitFor(() => expect(loadSubmissions).toHaveBeenLastCalledWith("沒有這筆"));
  });

  it("shows edit and delete actions like the orders list", async () => {
    const deleteSubmission = vi.fn().mockResolvedValue(undefined);
    const loadSubmissions = vi.fn()
      .mockResolvedValueOnce(submissions)
      .mockResolvedValueOnce([]);
    render(
      <MemoryRouter>
        <EnquiryPendingListPage
          canManage
          loadSubmissions={loadSubmissions}
          deleteSubmission={deleteSubmission}
        />
      </MemoryRouter>,
    );
    await screen.findByText("先生陳大文");
    expect(screen.getByRole("link", { name: "編輯" })).toHaveAttribute("href", "/quotes/pending/sub-1");

    await userEvent.click(screen.getByRole("button", { name: "刪除 先生陳大文" }));
    const dialog = await screen.findByRole("alertdialog", { name: "刪除待報價" });
    await userEvent.click(within(dialog).getByRole("button", { name: "刪除" }));
    await waitFor(() => expect(deleteSubmission).toHaveBeenCalledWith("sub-1"));
    expect(await screen.findByText("暫無待報價查詢")).toBeInTheDocument();
  });
});
