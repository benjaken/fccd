import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { EnquiryFormsListPage } from "@/components/EnquiryFormsListPage";
import type { EnquiryFormListItem } from "@/lib/enquiry-forms-api";

const forms: EnquiryFormListItem[] = [
  {
    id: "form-1",
    internalName: "FC Catering Enquiry",
    publicTitle: "餐飲到會網上查詢",
    status: "published",
    questionCount: 24,
    slug: "quote-inquiry",
    isDefault: true,
    updatedAt: "2026-09-03T00:00:00.000Z",
  },
  {
    id: "form-2",
    internalName: "草稿表單",
    publicTitle: "未發佈",
    status: "draft",
    questionCount: 2,
    slug: "draft-form",
    isDefault: false,
    updatedAt: "2026-09-03T01:00:00.000Z",
  },
];

describe("EnquiryFormsListPage", () => {
  it("renders enquiry forms in the shared table", async () => {
    const loadForms = vi.fn().mockResolvedValue(forms);
    render(
      <MemoryRouter>
        <EnquiryFormsListPage canManage loadForms={loadForms} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "FC Catering Enquiry" })).toHaveClass("order-link");
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "內部名稱" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "公開標題" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "啟用" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "停用表單「FC Catering Enquiry」" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("switch", { name: "啟用表單「草稿表單」" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("link", { name: "/quote-inquiry/form-1" })).toHaveClass("order-link");
    expect(screen.getByRole("link", { name: "/quote-inquiry/form-1" })).toHaveAttribute("href", "/quote-inquiry/form-1");
    expect(screen.getByText("草稿表單")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(document.querySelector(".quotes-toolbar .list-search")).not.toBeNull();
  });

  it("filters table rows by search", async () => {
    render(
      <MemoryRouter>
        <EnquiryFormsListPage canManage loadForms={async () => forms} />
      </MemoryRouter>,
    );
    await screen.findByText("FC Catering Enquiry");
    await userEvent.type(screen.getByRole("searchbox", { name: "搜尋表單" }), "草稿");
    await waitFor(() => {
      expect(screen.getByText("草稿表單")).toBeInTheDocument();
      expect(screen.queryByText("FC Catering Enquiry")).not.toBeInTheDocument();
    });
  });

  it("toggles publish state with the enable switch", async () => {
    const setFormStatus = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <EnquiryFormsListPage canManage loadForms={async () => forms} setFormStatus={setFormStatus} />
      </MemoryRouter>,
    );
    await screen.findByText("草稿表單");
    await userEvent.click(screen.getByRole("switch", { name: "啟用表單「草稿表單」" }));
    await waitFor(() => expect(setFormStatus).toHaveBeenCalledWith("form-2", "published"));
    expect(screen.getByRole("link", { name: "/quote-inquiry/form-2" })).toHaveAttribute(
      "href",
      "/quote-inquiry/form-2",
    );
  });

  it("shows edit, copy, and delete actions for every form", async () => {
    const deleteForm = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <EnquiryFormsListPage canManage loadForms={async () => forms} deleteForm={deleteForm} />
      </MemoryRouter>,
    );
    await screen.findByText("草稿表單");

    const editLinks = screen.getAllByRole("link", { name: "編輯" });
    expect(editLinks[0]).toHaveAttribute("href", "/quotes/enquiry-forms/form-1/edit");
    expect(editLinks[1]).toHaveAttribute("href", "/quotes/enquiry-forms/form-2/edit");
    expect(screen.getAllByRole("button", { name: "複製" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "刪除 FC Catering Enquiry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刪除 草稿表單" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "刪除 草稿表單" }));
    const dialog = await screen.findByRole("alertdialog", { name: "刪除 Enquiry 表單" });
    await userEvent.click(within(dialog).getByRole("button", { name: "刪除" }));
    await waitFor(() => expect(deleteForm).toHaveBeenCalledWith("form-2"));
  });

  it("shows a retryable empty state when loading fails", async () => {
    const loadForms = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce(forms);
    render(
      <MemoryRouter>
        <EnquiryFormsListPage canManage loadForms={loadForms} />
      </MemoryRouter>,
    );
    expect(await screen.findByText("無法載入表單列表")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "重試" }));
    expect(await screen.findByText("FC Catering Enquiry")).toBeInTheDocument();
    await waitFor(() => expect(loadForms).toHaveBeenCalledTimes(2));
  });

  it("opens the editor without creating a form record", async () => {
    render(
      <MemoryRouter initialEntries={["/quotes/enquiry-forms"]}>
        <Routes>
          <Route
            path="/quotes/enquiry-forms"
            element={<EnquiryFormsListPage canManage loadForms={async () => forms} />}
          />
          <Route path="/quotes/enquiry-forms/:id/edit" element={<p>unsaved-editor</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("FC Catering Enquiry");
    await userEvent.click(screen.getByRole("button", { name: "新增表單" }));
    expect(await screen.findByText("unsaved-editor")).toBeInTheDocument();
  });
});
