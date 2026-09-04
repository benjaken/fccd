import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CATERING_ENQUIRY_SEED_FORM, CATERING_ENQUIRY_SEED_FORM_ID } from "@/lib/enquiry-form-seed";
import { NEW_ENQUIRY_FORM_ID } from "@/lib/enquiry-form";

const fetchEnquiryForm = vi.fn();
const saveEnquiryForm = vi.fn();
const duplicateEnquiryForm = vi.fn();

vi.mock("@/lib/enquiry-forms-api", () => ({
  fetchEnquiryForm: (...args: unknown[]) => fetchEnquiryForm(...args),
  saveEnquiryForm: (...args: unknown[]) => saveEnquiryForm(...args),
  duplicateEnquiryForm: (...args: unknown[]) => duplicateEnquiryForm(...args),
}));

import { EnquiryFormEditorPage } from "@/components/EnquiryFormEditorPage";

function renderEditor(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/quotes/enquiry-forms/${id}/edit`]}>
      <Routes>
        <Route path="/quotes/enquiry-forms/:id/edit" element={<EnquiryFormEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("EnquiryFormEditorPage", () => {
  beforeEach(() => {
    fetchEnquiryForm.mockReset();
    saveEnquiryForm.mockReset();
    duplicateEnquiryForm.mockReset();
    fetchEnquiryForm.mockResolvedValue(null);
    saveEnquiryForm.mockImplementation(async (form: unknown) => {
      fetchEnquiryForm.mockResolvedValue(form);
    });
  });

  it("uses the quote editor two-column layout and does not rewrite an existing form on load", async () => {
    fetchEnquiryForm.mockResolvedValue({
      id: CATERING_ENQUIRY_SEED_FORM_ID,
      ...CATERING_ENQUIRY_SEED_FORM,
    });

    renderEditor(CATERING_ENQUIRY_SEED_FORM_ID);

    expect(await screen.findByRole("heading", { name: "表單資料" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "公開頁面" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "題目列表" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "題目設定" })).toBeInTheDocument();
    expect(screen.getByDisplayValue(CATERING_ENQUIRY_SEED_FORM.internalName)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "姓名" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "了解條款及政策" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(25);
    expect(screen.getByRole("button", { name: "新增題目" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上移" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下移" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "調整題目順序 1 姓名" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "載入 EmailMeForm 24 題" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: `/quote-inquiry/${CATERING_ENQUIRY_SEED_FORM_ID}` })).toHaveClass("order-link");
    const status = screen.getByText("已發佈");
    expect(status).toHaveClass("status-badge", "green");
    expect(status.closest(".heading-actions")).toContainElement(screen.getByRole("button", { name: "儲存" }));
    expect(screen.getByRole("button", { name: "儲存" })).toHaveClass("bg-primary");
    expect(screen.getByRole("button", { name: "複製" })).toHaveClass("border");
    expect(saveEnquiryForm).not.toHaveBeenCalled();
  });

  it("opens a new form locally with five contact questions and only persists on save", async () => {
    renderEditor(NEW_ENQUIRY_FORM_ID);

    expect(await screen.findByRole("button", { name: "姓名" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "公司/機構名稱" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "聯絡電話" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "電郵地址" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "送貨地址" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "了解條款及政策" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(6);
    expect(fetchEnquiryForm).not.toHaveBeenCalled();
    expect(saveEnquiryForm).not.toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: "必填" })).toBeChecked();
    expect(screen.getByLabelText("題型")).toHaveValue("input");

    await userEvent.click(screen.getByRole("button", { name: "新增題目" }));
    expect(await screen.findByRole("button", { name: "未命名題目" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("題型"), "checkbox");
    expect(screen.getByLabelText("題型")).toHaveValue("checkbox");
    expect(screen.getByRole("switch", { name: "必須全選" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(saveEnquiryForm).toHaveBeenCalledTimes(1));
    const saved = saveEnquiryForm.mock.calls[0]?.[0] as { id: string; questions: unknown[] };
    expect(saved.id).not.toBe(NEW_ENQUIRY_FORM_ID);
    expect(saved.questions).toHaveLength(6);
  });

  it("reorders questions by dragging a row handle", async () => {
    renderEditor(NEW_ENQUIRY_FORM_ID);
    expect(await screen.findByRole("button", { name: "姓名" })).toBeInTheDocument();

    const dragHandle = screen.getByRole("button", { name: "調整題目順序 1 姓名" });
    const targetRow = screen.getByRole("button", { name: "送貨地址" }).closest("tr");
    expect(targetRow).not.toBeNull();
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: vi.fn(),
      getData: vi.fn(),
    };
    fireEvent.dragStart(dragHandle, { dataTransfer });
    fireEvent.dragOver(targetRow!, { dataTransfer });
    fireEvent.drop(targetRow!, { dataTransfer });

    expect(screen.getByRole("button", { name: "調整題目順序 1 公司/機構名稱" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "調整題目順序 5 姓名" })).toBeInTheDocument();
  });

  it("does not publish a required choice question after all options are removed", async () => {
    renderEditor(NEW_ENQUIRY_FORM_ID);
    await userEvent.click(await screen.findByRole("button", { name: "新增題目" }));
    await userEvent.type(screen.getByLabelText("Slug"), "test-form");
    await userEvent.selectOptions(screen.getByLabelText("題型"), "radio");
    await userEvent.click(screen.getByRole("switch", { name: "必填" }));
    await userEvent.clear(screen.getByLabelText(/選項/));
    await userEvent.click(screen.getByRole("button", { name: "發佈" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("第 6 題至少需要一個選項");
    expect(saveEnquiryForm).not.toHaveBeenCalled();
  });
});
