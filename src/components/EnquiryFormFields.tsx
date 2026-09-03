import {
  isEnquiryOptionCompact,
  type EnquiryAnswerValue,
  type EnquiryAnswers,
  type EnquiryFieldError,
  type EnquiryQuestion,
} from "@/lib/enquiry-form";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import "./enquiry-form.css";

export function EnquiryFormFields({
  questions,
  answers,
  errors = [],
  disabled = false,
  splitLayout = false,
  onChange,
}: {
  questions: EnquiryQuestion[];
  answers: EnquiryAnswers;
  errors?: EnquiryFieldError[];
  disabled?: boolean;
  splitLayout?: boolean;
  onChange?: (fieldKey: string, value: EnquiryAnswerValue) => void;
}) {
  const errorMap = new Map(errors.map((error) => [error.fieldKey, error.message]));
  return (
    <div className={cn("enquiry-form-fields", splitLayout && "enquiry-form-fields-split")}>
      {questions.map((question) => {
        const error = errorMap.get(question.fieldKey);
        const value = answers[question.fieldKey];
        const labelId = `enquiry-label-${question.fieldKey}`;
        const controlId = `enquiry-${question.fieldKey}`;
        const isGroup = question.type === "radio" || question.type === "checkbox";
        return (
          <div key={question.fieldKey} className={cn("enquiry-form-question", error && "has-error")}>
            <label className="enquiry-form-label" id={labelId} htmlFor={isGroup ? undefined : controlId}>
              <span>
                {question.title}
                {question.required ? <em aria-hidden="true"> *</em> : null}
              </span>
            </label>
            <div className="enquiry-form-control">
              <EnquiryControl
                question={question}
                value={value}
                disabled={disabled}
                invalid={Boolean(error)}
                labelledBy={labelId}
                onChange={(next) => onChange?.(question.fieldKey, next)}
              />
              {question.hint ? <p className="enquiry-form-hint">{question.hint}</p> : null}
              {error ? <p className="enquiry-form-error" role="alert">{error}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EnquiryControl({
  question,
  value,
  disabled,
  invalid,
  labelledBy,
  onChange,
}: {
  question: EnquiryQuestion;
  value: EnquiryAnswerValue;
  disabled: boolean;
  invalid: boolean;
  labelledBy: string;
  onChange: (value: EnquiryAnswerValue) => void;
}) {
  const id = `enquiry-${question.fieldKey}`;
  if (question.type === "textarea") {
    return (
      <textarea
        id={id}
        className="enquiry-form-textarea"
        rows={5}
        disabled={disabled}
        aria-invalid={invalid}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (question.type === "number") {
    return (
      <Input
        id={id}
        type="number"
        min={question.minNumber}
        max={question.maxNumber}
        disabled={disabled}
        aria-invalid={invalid}
        value={value == null || Array.isArray(value) ? "" : String(value)}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === "" ? null : Number(next));
        }}
      />
    );
  }
  if (question.type === "date") {
    return (
      <DatePicker
        id={id}
        label={question.title}
        hideLabel
        disabled={disabled}
        invalid={invalid}
        value={typeof value === "string" ? value : ""}
        onChange={onChange}
      />
    );
  }
  if (question.type === "radio") {
    return (
      <div
        className="enquiry-form-options"
        role="radiogroup"
        aria-labelledby={labelledBy}
        aria-invalid={invalid || undefined}
      >
        {(question.options ?? []).map((option) => (
          <label
            key={option.value}
            className={cn(
              "enquiry-form-option",
              (question.requireAllOptions || !isEnquiryOptionCompact(option.label)) && "is-wide",
            )}
          >
            <input
              type="radio"
              name={question.fieldKey}
              value={option.value}
              disabled={disabled}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    );
  }
  if (question.type === "checkbox") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="enquiry-form-options" aria-invalid={invalid || undefined}>
        {(question.options ?? []).map((option) => {
          const checked = selected.includes(option.value);
          return (
            <label
              key={option.value}
              className={cn(
                "enquiry-form-option",
                (question.requireAllOptions || !isEnquiryOptionCompact(option.label)) && "is-wide",
              )}
            >
              <input
                type="checkbox"
                disabled={disabled}
                checked={checked}
                onChange={() => {
                  onChange(
                    checked
                      ? selected.filter((item) => item !== option.value)
                      : [...selected, option.value],
                  );
                }}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    );
  }
  return (
    <Input
      id={id}
      type={question.inputFormat === "email" ? "email" : question.inputFormat === "phone" ? "tel" : "text"}
      disabled={disabled}
      aria-invalid={invalid}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
