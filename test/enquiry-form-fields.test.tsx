import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EnquiryFormFields } from "@/components/EnquiryFormFields";
import { CATERING_ENQUIRY_SEED_QUESTIONS } from "@/lib/enquiry-form-seed";
import { emptyAnswers, type EnquiryQuestion } from "@/lib/enquiry-form";

const questions: EnquiryQuestion[] = [
  { fieldKey: "name", type: "input", title: "姓名", required: true },
  {
    fieldKey: "title",
    type: "radio",
    title: "稱謂",
    required: true,
    options: [
      { label: "先生", value: "先生" },
      { label: "小姐", value: "小姐" },
    ],
  },
  {
    fieldKey: "formats",
    type: "checkbox",
    title: "有興趣了解的到會形式",
    required: true,
    options: [
      { label: "正餐 到會 (大盤)", value: "meal" },
      { label: "小食 到會 (大盤)", value: "snack" },
    ],
  },
];

describe("EnquiryFormFields compact editor layout", () => {
  it("keeps text inputs and summarizes choices until the edit modal opens", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <EnquiryFormFields
        questions={questions}
        answers={{ name: "sing", title: "先生", formats: ["meal"] }}
        twoColumn
        choiceSummary
        onChange={onChange}
      />,
    );

    expect(document.querySelector(".enquiry-form-fields-columns")).not.toBeNull();
    expect(screen.getByDisplayValue("sing")).toBeInTheDocument();
    expect(screen.getByText("先生")).toBeInTheDocument();
    expect(screen.getByText("正餐 到會 (大盤)")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    const editSalutation = screen.getByRole("button", { name: "編輯稱謂" });
    expect(editSalutation).not.toHaveTextContent("編輯");
    expect(editSalutation.querySelector("svg")).not.toBeNull();
    expect(document.querySelector(".enquiry-form-choice-value")).not.toBeNull();

    await user.click(editSalutation);
    expect(screen.getByRole("radio", { name: "小姐" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "小姐" }));
    await user.click(screen.getByRole("button", { name: "確認" }));
    expect(onChange).toHaveBeenCalledWith("title", "小姐");
  });

  it("does not save choice changes when the edit modal is cancelled", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <EnquiryFormFields
        questions={questions}
        answers={{ name: "sing", title: "先生", formats: ["meal"] }}
        twoColumn
        choiceSummary
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "編輯有興趣了解的到會形式" }));
    await user.click(screen.getByRole("checkbox", { name: "小食 到會 (大盤)" }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("puts remarks and terms in the two columns instead of full-width rows", () => {
    render(
      <EnquiryFormFields
        questions={CATERING_ENQUIRY_SEED_QUESTIONS}
        answers={emptyAnswers(CATERING_ENQUIRY_SEED_QUESTIONS)}
        twoColumn
        choiceSummary
        onChange={vi.fn()}
      />,
    );

    const columns = document.querySelectorAll(".enquiry-form-column");
    expect(columns).toHaveLength(2);
    expect(document.querySelector(".enquiry-form-column + .enquiry-form-column")).not.toBeNull();
    expect(document.getElementById("enquiry-question-remarks")).not.toHaveClass("is-wide");
    expect(document.getElementById("enquiry-question-terms")).not.toHaveClass("is-wide");
    expect(columns[0]).toContainElement(document.getElementById("enquiry-question-remarks"));
    expect(columns[1]).toContainElement(document.getElementById("enquiry-question-terms"));
  });
});
