import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.hoisted(() => vi.fn());
const functionsInvoke = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: rpcMock,
    from: vi.fn(),
    functions: { invoke: (...args: unknown[]) => functionsInvoke(...args) },
  },
}));

import { PublicEnquiryFormPage } from "@/components/PublicEnquiryFormPage";
import { CATERING_ENQUIRY_SEED_FORM, CATERING_ENQUIRY_SEED_FORM_ID } from "@/lib/enquiry-form-seed";
import { serializeEnquiryQuestions } from "@/lib/enquiry-form";

const publishedForm = {
  id: CATERING_ENQUIRY_SEED_FORM_ID,
  internal_name: CATERING_ENQUIRY_SEED_FORM.internalName,
  public_title: CATERING_ENQUIRY_SEED_FORM.publicTitle,
  public_description: CATERING_ENQUIRY_SEED_FORM.publicDescription,
  submit_label: CATERING_ENQUIRY_SEED_FORM.submitLabel,
  slug: CATERING_ENQUIRY_SEED_FORM.slug,
  is_default: true,
  status: "published",
  success_message: CATERING_ENQUIRY_SEED_FORM.successMessage,
  ack_email_subject: "",
  ack_email_body: "",
  asana_project_gid: "",
  questions: serializeEnquiryQuestions(CATERING_ENQUIRY_SEED_FORM.questions),
  created_at: "2026-09-03T00:00:00.000Z",
  updated_at: "2026-09-03T00:00:00.000Z",
};

describe("public enquiry form page", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    functionsInvoke.mockReset();
    functionsInvoke.mockResolvedValue({ data: { internalEmailStatus: "sent" }, error: null });
  });

  it("renders the published form without a login screen", async () => {
    rpcMock.mockResolvedValueOnce({ data: publishedForm, error: null });
    render(
      <MemoryRouter initialEntries={["/quote-inquiry"]}>
        <Routes>
          <Route path="/quote-inquiry" element={<PublicEnquiryFormPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: publishedForm.public_title })).toBeInTheDocument();
    expect(screen.getByText("姓名")).toBeInTheDocument();
    expect(screen.queryByText(/登入/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledWith("get_published_enquiry_form", { p_slug: null });
  });

  it("loads a published form by id in the public URL", async () => {
    rpcMock.mockResolvedValueOnce({ data: publishedForm, error: null });
    render(
      <MemoryRouter initialEntries={[`/quote-inquiry/${CATERING_ENQUIRY_SEED_FORM_ID}`]}>
        <Routes>
          <Route path="/quote-inquiry/:formId" element={<PublicEnquiryFormPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: publishedForm.public_title })).toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledWith("get_published_enquiry_form", {
      p_slug: CATERING_ENQUIRY_SEED_FORM_ID,
    });
  });

  it("blocks submit when required answers are missing", async () => {
    rpcMock.mockResolvedValue({ data: publishedForm, error: null });
    render(
      <MemoryRouter initialEntries={["/quote-inquiry"]}>
        <Routes>
          <Route path="/quote-inquiry" element={<PublicEnquiryFormPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Submit" });
    const firstQuestion = document.getElementById("enquiry-question-name");
    expect(firstQuestion).not.toBeNull();
    const scrollIntoView = vi.fn();
    firstQuestion!.scrollIntoView = scrollIntoView;
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    const errors = await screen.findAllByText("此題為必填");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toHaveClass("enquiry-form-error");
    expect(errors[0].closest(".enquiry-form-question")).toHaveClass("has-error");
    expect(screen.getByRole("textbox", { name: /姓名/ })).toHaveAttribute("aria-invalid", "true");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(screen.getByRole("textbox", { name: /姓名/ })).toHaveFocus();
    expect(rpcMock).not.toHaveBeenCalledWith(
      "submit_enquiry_form",
      expect.anything(),
    );
  });

  it("shows a friendly empty state when no form is published", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    render(
      <MemoryRouter initialEntries={["/quote-inquiry"]}>
        <Routes>
          <Route path="/quote-inquiry" element={<PublicEnquiryFormPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "暫不接受查詢" })).toBeInTheDocument();
  });

  it("uses a 1000px left-right public form layout", async () => {
    rpcMock.mockResolvedValueOnce({ data: publishedForm, error: null });
    const { container } = render(
      <MemoryRouter initialEntries={["/quote-inquiry"]}>
        <Routes>
          <Route path="/quote-inquiry" element={<PublicEnquiryFormPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: publishedForm.public_title });
    expect(container.querySelector(".enquiry-public-shell")).not.toBeNull();
    expect(container.querySelector(".enquiry-form-fields-split")).not.toBeNull();
    expect(container.querySelector(".enquiry-form-control")).not.toBeNull();

    const css = readFileSync(path.resolve(process.cwd(), "src/components/enquiry-form.css"), "utf8");
    expect(css).toMatch(/\.enquiry-public-shell\s*\{[^}]*width:\s*min\(100% - 32px,\s*1000px\)/s);
    expect(css).toMatch(/\.enquiry-public-page\s*\{[^}]*background:/s);
    expect(css).toMatch(/\.enquiry-public-card[^}]*padding:\s*28px 32px/s);
    expect(css).toContain("grid-template-columns: minmax(200px, 34%) minmax(0, 1fr)");
    expect(css).toContain("grid-column: 1 / -1");
    expect(css).toMatch(/\.enquiry-form-option\s*\{[^}]*align-items:\s*center/s);
    expect(css).toMatch(/\.enquiry-form-error\s*\{[^}]*color:\s*#dc2626/s);
    expect(css).toMatch(/\.enquiry-form-question\.has-error [^{]*\{[^}]*border-color:\s*#dc2626/s);
    expect(container.querySelector(".enquiry-form-option.is-wide")).not.toBeNull();
    expect(container.querySelector(".enquiry-form-options.is-stacked")).not.toBeNull();
  });

  it("shows a success page after submit and sends notification mail", async () => {
    const simpleForm = {
      ...publishedForm,
      questions: serializeEnquiryQuestions([
        { fieldKey: "name", type: "input" as const, title: "姓名", required: true, inputFormat: "general" as const },
        { fieldKey: "email", type: "input" as const, title: "電郵地址", required: true, inputFormat: "email" as const, quoteField: "email" as const },
      ]),
    };
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "get_published_enquiry_form") return { data: simpleForm, error: null };
      if (name === "submit_enquiry_form") {
        return { data: [{ id: "sub-1", reference_code: "ENQ20260903-TEST01" }], error: null };
      }
      return { data: null, error: null };
    });
    render(
      <MemoryRouter initialEntries={["/quote-inquiry"]}>
        <Routes>
          <Route path="/quote-inquiry" element={<PublicEnquiryFormPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Submit" });
    await userEvent.type(screen.getByRole("textbox", { name: /姓名/ }), "陳大文");
    await userEvent.type(screen.getByRole("textbox", { name: /電郵地址/ }), "chan@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("參考編號：ENQ20260903-TEST01")).toBeInTheDocument();
    expect(screen.getByText(publishedForm.success_message)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(functionsInvoke).toHaveBeenCalledWith("send-enquiry-notifications", {
        body: { submissionId: "sub-1", force: false, kind: "all" },
      }),
    );
  });
});
