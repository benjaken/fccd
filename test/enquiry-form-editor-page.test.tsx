import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CATERING_ENQUIRY_SEED_FORM, CATERING_ENQUIRY_SEED_FORM_ID } from "@/lib/enquiry-form-seed";

const fetchEnquiryForm = vi.fn();
const saveEnquiryForm = vi.fn();
const duplicateEnquiryForm = vi.fn();

vi.mock("@/lib/enquiry-forms-api", () => ({
  fetchEnquiryForm: (...args: unknown[]) => fetchEnquiryForm(...args),
  saveEnquiryForm: (...args: unknown[]) => saveEnquiryForm(...args),
  duplicateEnquiryForm: (...args: unknown[]) => duplicateEnquiryForm(...args),
}));

import { EnquiryFormEditorPage } from "@/components/EnquiryFormEditorPage";

describe("EnquiryFormEditorPage", () => {
  beforeEach(() => {
    fetchEnquiryForm.mockReset();
    saveEnquiryForm.mockReset();
    duplicateEnquiryForm.mockReset();
  });

  it("uses the quote editor two-column layout and loads EmailMeForm questions when empty", async () => {
    fetchEnquiryForm.mockResolvedValue({
      id: CATERING_ENQUIRY_SEED_FORM_ID,
      ...CATERING_ENQUIRY_SEED_FORM,
      questions: [],
    });

    render(
      <MemoryRouter initialEntries={[`/quotes/enquiry-forms/${CATERING_ENQUIRY_SEED_FORM_ID}/edit`]}>
        <Routes>
          <Route path="/quotes/enquiry-forms/:id/edit" element={<EnquiryFormEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "表單資料" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "公開頁面" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "題目列表" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "題目設定" })).toBeInTheDocument();
    expect(screen.getByDisplayValue(CATERING_ENQUIRY_SEED_FORM.internalName)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "姓名" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "了解條款及政策" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(25);
    expect(screen.getByRole("link", { name: `/quote-inquiry/${CATERING_ENQUIRY_SEED_FORM_ID}` })).toHaveClass("order-link");
    expect(screen.getByRole("link", { name: `/quote-inquiry/${CATERING_ENQUIRY_SEED_FORM_ID}` })).toHaveAttribute(
      "href",
      `/quote-inquiry/${CATERING_ENQUIRY_SEED_FORM_ID}`,
    );
    await waitFor(() => expect(saveEnquiryForm).toHaveBeenCalledTimes(1));
  });

  it("replaces questions with the EmailMeForm seed from the toolbar", async () => {
    fetchEnquiryForm.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      ...CATERING_ENQUIRY_SEED_FORM,
      questions: [{ fieldKey: "only", type: "input", title: "舊題", required: false }],
    });

    render(
      <MemoryRouter initialEntries={[`/quotes/enquiry-forms/${CATERING_ENQUIRY_SEED_FORM_ID}/edit`]}>
        <Routes>
          <Route path="/quotes/enquiry-forms/:id/edit" element={<EnquiryFormEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "舊題" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "載入 EmailMeForm 24 題" }));
    expect(await screen.findByRole("button", { name: "姓名" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "舊題" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(25));
  });
});
