export type EnquiryQuestionType =
  | "radio"
  | "checkbox"
  | "input"
  | "textarea"
  | "date"
  | "number";

export type EnquiryQuoteField =
  | "customer_name"
  | "salutation"
  | "company_name"
  | "phone"
  | "email"
  | "shipping_address"
  | "delivery_date"
  | "delivery_time"
  | "headcount"
  | "quote_description";

export type EnquiryFormStatus = "draft" | "published" | "disabled";

export type EnquiryQuestionOption = {
  label: string;
  value: string;
  defaultChecked?: boolean;
};

export type EnquiryQuestion = {
  fieldKey: string;
  type: EnquiryQuestionType;
  title: string;
  hint?: string;
  required: boolean;
  quoteField?: EnquiryQuoteField | null;
  inputFormat?: "general" | "email" | "phone";
  minNumber?: number;
  maxNumber?: number;
  requireAllOptions?: boolean;
  defaultValue?: string | number | string[] | null;
  options?: EnquiryQuestionOption[];
};

export type EnquiryFormDefinition = {
  id: string;
  internalName: string;
  publicTitle: string;
  publicDescription: string;
  submitLabel: string;
  slug: string;
  isDefault: boolean;
  status: EnquiryFormStatus;
  successMessage: string;
  ackEmailSubject: string;
  ackEmailBody: string;
  asanaProjectGid: string;
  questions: EnquiryQuestion[];
  updatedAt?: string;
  createdAt?: string;
};

export type EnquiryAnswerValue = string | string[] | number | null;

export type EnquiryAnswers = Record<string, EnquiryAnswerValue>;

export type EnquiryMappedSnapshots = {
  customerName: string;
  salutation: string;
  companyName: string;
  phone: string;
  email: string;
  address: string;
  deliveryDateRaw: string;
  deliveryDate: string | null;
  deliveryTime: string;
  headcount: string;
  quoteDescription: string;
};

export type EnquiryFieldError = {
  fieldKey: string;
  title: string;
  message: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function emptyAnswers(questions: EnquiryQuestion[]): EnquiryAnswers {
  const answers: EnquiryAnswers = {};
  for (const question of questions) {
    answers[question.fieldKey] = defaultAnswer(question);
  }
  return answers;
}

export function defaultAnswer(question: EnquiryQuestion): EnquiryAnswerValue {
  if (question.type === "checkbox") {
    const selected = (question.options ?? [])
      .filter((option) => option.defaultChecked)
      .map((option) => option.value);
    if (selected.length) return selected;
    if (Array.isArray(question.defaultValue)) return [...question.defaultValue];
    return [];
  }
  if (question.type === "radio") {
    const preset = (question.options ?? []).find((option) => option.defaultChecked);
    if (preset) return preset.value;
    if (typeof question.defaultValue === "string") return question.defaultValue;
    return "";
  }
  if (question.type === "number") {
    if (typeof question.defaultValue === "number") return question.defaultValue;
    if (typeof question.defaultValue === "string" && question.defaultValue !== "") {
      const parsed = Number(question.defaultValue);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }
  if (typeof question.defaultValue === "string") return question.defaultValue;
  return "";
}

export function isAnswerEmpty(value: EnquiryAnswerValue): boolean {
  if (value == null) return true;
  if (typeof value === "number") return false;
  if (Array.isArray(value)) return value.filter(Boolean).length === 0;
  return value.trim() === "";
}

export function validateEnquiryAnswers(
  questions: EnquiryQuestion[],
  answers: EnquiryAnswers,
): EnquiryFieldError[] {
  const errors: EnquiryFieldError[] = [];
  for (const question of questions) {
    const value = answers[question.fieldKey];
    const error = validateEnquiryAnswer(question, value);
    if (error) errors.push(error);
  }
  return errors;
}

export function validateEnquiryAnswer(
  question: EnquiryQuestion,
  value: EnquiryAnswerValue,
): EnquiryFieldError | null {
  const empty = isAnswerEmpty(value);
  if (question.required && empty) {
    return fieldError(question, "此題為必填");
  }
  if (empty) return null;

  if (question.type === "checkbox" && Array.isArray(value)) {
    const selected = value.filter(Boolean);
    if (question.required && question.requireAllOptions) {
      const optionValues = (question.options ?? []).map((option) => option.value);
      const missing = optionValues.some((option) => !selected.includes(option));
      if (missing) return fieldError(question, "必須全選");
    }
    if (question.required && selected.length === 0) {
      return fieldError(question, "請至少選一項");
    }
  }

  if (question.type === "input" && typeof value === "string") {
    if (question.inputFormat === "email" && !EMAIL_PATTERN.test(value.trim())) {
      return fieldError(question, "請輸入有效電郵");
    }
  }

  if (question.type === "number") {
    const numeric = typeof value === "number" ? value : Number(String(value).trim());
    if (!Number.isFinite(numeric)) return fieldError(question, "請輸入數字");
    if (question.minNumber != null && numeric < question.minNumber) {
      return fieldError(question, `最少 ${question.minNumber}`);
    }
    if (question.maxNumber != null && numeric > question.maxNumber) {
      return fieldError(question, `最多 ${question.maxNumber}`);
    }
  }

  return null;
}

export function mapEnquiryAnswers(
  questions: EnquiryQuestion[],
  answers: EnquiryAnswers,
): EnquiryMappedSnapshots {
  const mapped: EnquiryMappedSnapshots = {
    customerName: "",
    salutation: "",
    companyName: "",
    phone: "",
    email: "",
    address: "",
    deliveryDateRaw: "",
    deliveryDate: null,
    deliveryTime: "",
    headcount: "",
    quoteDescription: "",
  };

  for (const question of questions) {
    const field = question.quoteField;
    if (!field) continue;
    const raw = formatAnswer(question, answers[question.fieldKey]);
    switch (field) {
      case "customer_name":
        mapped.customerName = raw;
        break;
      case "salutation":
        mapped.salutation = raw;
        break;
      case "company_name":
        mapped.companyName = raw;
        break;
      case "phone":
        mapped.phone = raw;
        break;
      case "email":
        mapped.email = raw;
        break;
      case "shipping_address":
        mapped.address = raw;
        break;
      case "delivery_date":
        mapped.deliveryDateRaw = raw;
        mapped.deliveryDate = parseDeliveryDate(question, answers[question.fieldKey]);
        break;
      case "delivery_time":
        mapped.deliveryTime = raw;
        break;
      case "headcount":
        mapped.headcount = raw;
        break;
      case "quote_description":
        mapped.quoteDescription = raw;
        break;
    }
  }
  return mapped;
}

export function convertEnquiryRequirements(mapped: EnquiryMappedSnapshots): string[] {
  const missing: string[] = [];
  if (!mapped.customerName.trim()) missing.push("姓名");
  if (!mapped.email.trim() && !mapped.phone.trim()) missing.push("電郵或電話");
  return missing;
}

export function parseDeliveryDate(
  question: EnquiryQuestion,
  value: EnquiryAnswerValue,
): string | null {
  if (value == null || Array.isArray(value)) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (question.type === "date" && DATE_KEY_PATTERN.test(text)) return text;
  const iso = text.match(DATE_KEY_PATTERN);
  if (iso) return text;
  const dotted = text.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);
  if (dotted) {
    return `${dotted[1]}-${dotted[2].padStart(2, "0")}-${dotted[3].padStart(2, "0")}`;
  }
  return null;
}

export function formatAnswer(
  question: EnquiryQuestion,
  value: EnquiryAnswerValue,
): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    const labels = new Map(
      (question.options ?? []).map((option) => [option.value, option.label]),
    );
    return value
      .filter(Boolean)
      .map((item) => labels.get(item) ?? item)
      .join("、");
  }
  if (typeof value === "number") return String(value);
  if (question.type === "radio") {
    const match = (question.options ?? []).find((option) => option.value === value);
    return match?.label ?? value;
  }
  return value.trim();
}

export function customerDisplayName(mapped: EnquiryMappedSnapshots): string {
  return `${mapped.salutation}${mapped.customerName}`.trim();
}

function fieldError(question: EnquiryQuestion, message: string): EnquiryFieldError {
  return { fieldKey: question.fieldKey, title: question.title, message };
}

export function parseEnquiryQuestions(value: unknown): EnquiryQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseEnquiryQuestion).filter((question): question is EnquiryQuestion => Boolean(question));
}

function parseEnquiryQuestion(value: unknown): EnquiryQuestion | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const fieldKey = String(row.field_key ?? row.fieldKey ?? "").trim();
  const type = String(row.type ?? "") as EnquiryQuestionType;
  const title = String(row.title ?? "").trim();
  if (!fieldKey || !title || !isQuestionType(type)) return null;
  return {
    fieldKey,
    type,
    title,
    hint: optionalString(row.hint),
    required: row.required === true,
    quoteField: parseQuoteField(row.quote_field ?? row.quoteField),
    inputFormat: parseInputFormat(row.input_format ?? row.inputFormat),
    minNumber: optionalNumber(row.min_number ?? row.minNumber),
    maxNumber: optionalNumber(row.max_number ?? row.maxNumber),
    requireAllOptions: row.require_all_options === true || row.requireAllOptions === true,
    defaultValue: parseDefaultValue(row.default_value ?? row.defaultValue),
    options: parseOptions(row.options),
  };
}

export function serializeEnquiryQuestions(questions: EnquiryQuestion[]): Record<string, unknown>[] {
  return questions.map((question) => ({
    field_key: question.fieldKey,
    type: question.type,
    title: question.title,
    hint: question.hint ?? "",
    required: question.required,
    quote_field: question.quoteField ?? null,
    input_format: question.inputFormat ?? "general",
    min_number: question.minNumber ?? null,
    max_number: question.maxNumber ?? null,
    require_all_options: question.requireAllOptions === true,
    default_value: question.defaultValue ?? null,
    options: (question.options ?? []).map((option) => ({
      label: option.label,
      value: option.value,
      default_checked: option.defaultChecked === true,
    })),
  }));
}

function parseOptions(value: unknown): EnquiryQuestionOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => {
    if (!item || typeof item !== "object") {
      return { label: String(item), value: String(item) };
    }
    const row = item as Record<string, unknown>;
    const label = String(row.label ?? row.value ?? "");
    return {
      label,
      value: String(row.value ?? label),
      defaultChecked: row.default_checked === true || row.defaultChecked === true,
    };
  });
}

function parseQuoteField(value: unknown): EnquiryQuoteField | null {
  const field = String(value ?? "");
  switch (field) {
    case "customer_name":
    case "salutation":
    case "company_name":
    case "phone":
    case "email":
    case "shipping_address":
    case "delivery_date":
    case "delivery_time":
    case "headcount":
    case "quote_description":
      return field;
    default:
      return null;
  }
}

function parseInputFormat(value: unknown): "general" | "email" | "phone" {
  if (value === "email" || value === "phone") return value;
  return "general";
}

function parseDefaultValue(value: unknown): EnquiryQuestion["defaultValue"] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "number" || typeof value === "string") return value;
  return null;
}

function isQuestionType(value: string): value is EnquiryQuestionType {
  return ["radio", "checkbox", "input", "textarea", "date", "number"].includes(value);
}

function optionalString(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}
