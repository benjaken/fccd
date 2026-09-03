import { supabase } from "@/lib/supabase";
import {
  mapEnquiryAnswers,
  parseEnquiryQuestions,
  serializeEnquiryQuestions,
  validateEnquiryAnswers,
  type EnquiryAnswers,
  type EnquiryFormDefinition,
  type EnquiryFormStatus,
  type EnquiryQuestion,
} from "@/lib/enquiry-form";

export type EnquiryFormListItem = {
  id: string;
  internalName: string;
  publicTitle: string;
  status: EnquiryFormStatus;
  questionCount: number;
  slug: string;
  isDefault: boolean;
  updatedAt: string;
};

export type EnquirySubmissionListItem = {
  id: string;
  createdAt: string;
  formTitle: string;
  customerName: string;
  salutation: string;
  companyName: string;
  phone: string;
  email: string;
  deliveryDateRaw: string;
  quoteDescription: string;
  headcount: string;
  internalEmailStatus: string;
  ackEmailStatus: string;
  asanaStatus: string;
  asanaLink: string;
};

export type EnquirySubmissionDetail = EnquirySubmissionListItem & {
  formId: string;
  formSnapshot: EnquiryQuestion[];
  answers: EnquiryAnswers;
  convertedQuoteId: string | null;
  originalAnswers: EnquiryAnswers;
};

type FormRow = {
  id: string;
  internal_name: string;
  public_title: string;
  public_description: string | null;
  submit_label: string;
  slug: string;
  is_default: boolean;
  status: EnquiryFormStatus;
  success_message: string | null;
  ack_email_subject: string | null;
  ack_email_body: string | null;
  asana_project_gid: string | null;
  questions: unknown;
  created_at: string;
  updated_at: string;
};

type SubmissionRow = {
  id: string;
  form_id: string;
  form_title: string;
  created_at: string;
  customer_name: string | null;
  salutation: string | null;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  delivery_date_raw: string | null;
  quote_description: string | null;
  headcount: string | null;
  internal_email_status: string;
  ack_email_status: string;
  asana_status: string;
  asana_link: string | null;
  form_snapshot: unknown;
  answers: unknown;
  original_answers: unknown;
  converted_quote_id: string | null;
};

function mapForm(row: FormRow): EnquiryFormDefinition {
  return {
    id: row.id,
    internalName: row.internal_name,
    publicTitle: row.public_title,
    publicDescription: row.public_description || "",
    submitLabel: row.submit_label,
    slug: row.slug,
    isDefault: row.is_default,
    status: row.status,
    successMessage: row.success_message || "",
    ackEmailSubject: row.ack_email_subject || "",
    ackEmailBody: row.ack_email_body || "",
    asanaProjectGid: row.asana_project_gid || "",
    questions: parseEnquiryQuestions(row.questions),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchPublishedEnquiryForm(slug?: string | null) {
  const { data, error } = await supabase.rpc("get_published_enquiry_form", {
    p_slug: slug || null,
  });
  if (error) throw error;
  if (!data) return null;
  return mapForm(data as FormRow);
}

export async function submitEnquiryForm(input: {
  formId: string;
  answers: EnquiryAnswers;
  questions: EnquiryQuestion[];
  idempotencyKey: string;
  honeypot?: string;
}) {
  const errors = validateEnquiryAnswers(input.questions, input.answers);
  if (errors.length) {
    const error = new Error("enquiry_validation_failed") as Error & {
      fieldErrors: typeof errors;
    };
    error.fieldErrors = errors;
    throw error;
  }
  const { data, error } = await supabase.rpc("submit_enquiry_form", {
    p_form_id: input.formId,
    p_answers: input.answers,
    p_idempotency_key: input.idempotencyKey,
    p_honeypot: input.honeypot || null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error("enquiry_submit_failed");
  return { id: row.id as string, referenceCode: String(row.reference_code ?? row.id) };
}

export async function fetchEnquiryForms(): Promise<EnquiryFormListItem[]> {
  const { data, error } = await supabase
    .from("enquiry_forms")
    .select("id,internal_name,public_title,status,slug,is_default,questions,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    internalName: row.internal_name,
    publicTitle: row.public_title,
    status: row.status,
    questionCount: Array.isArray(row.questions) ? row.questions.length : 0,
    slug: row.slug,
    isDefault: row.is_default,
    updatedAt: row.updated_at,
  }));
}

export async function fetchEnquiryForm(id: string): Promise<EnquiryFormDefinition | null> {
  const { data, error } = await supabase
    .from("enquiry_forms")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapForm(data as FormRow) : null;
}

export async function saveEnquiryForm(form: EnquiryFormDefinition) {
  const payload = {
    id: form.id,
    internal_name: form.internalName.trim(),
    public_title: form.publicTitle.trim(),
    public_description: form.publicDescription,
    submit_label: form.submitLabel.trim() || "Submit",
    slug: form.slug.trim(),
    is_default: form.isDefault,
    status: form.status,
    success_message: form.successMessage,
    ack_email_subject: form.ackEmailSubject,
    ack_email_body: form.ackEmailBody,
    asana_project_gid: form.asanaProjectGid,
    questions: serializeEnquiryQuestions(form.questions),
    updated_at: new Date().toISOString(),
  };
  if (form.isDefault) {
    const { error: clearError } = await supabase
      .from("enquiry_forms")
      .update({ is_default: false })
      .neq("id", form.id);
    if (clearError) throw clearError;
  }
  const { error } = await supabase.from("enquiry_forms").upsert(payload);
  if (error) throw error;
}

export async function createEnquiryForm(input: {
  internalName: string;
  publicTitle: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  const slug = `form-${id.slice(0, 8)}`;
  const { error } = await supabase.from("enquiry_forms").insert({
    id,
    internal_name: input.internalName.trim() || "未命名表單",
    public_title: input.publicTitle.trim() || input.internalName.trim() || "未命名表單",
    public_description: "",
    submit_label: "Submit",
    slug,
    is_default: false,
    status: "draft",
    success_message: "我們已收到你的查詢，稍後會有專人回覆。",
    questions: [],
  });
  if (error) throw error;
  return id;
}

export async function duplicateEnquiryForm(id: string): Promise<string> {
  const source = await fetchEnquiryForm(id);
  if (!source) throw new Error("enquiry_form_not_found");
  const nextId = crypto.randomUUID();
  const { error } = await supabase.from("enquiry_forms").insert({
    id: nextId,
    internal_name: `${source.internalName} 複製`,
    public_title: source.publicTitle,
    public_description: source.publicDescription,
    submit_label: source.submitLabel,
    slug: `${source.slug}-${nextId.slice(0, 6)}`,
    is_default: false,
    status: "draft",
    success_message: source.successMessage,
    ack_email_subject: source.ackEmailSubject,
    ack_email_body: source.ackEmailBody,
    asana_project_gid: source.asanaProjectGid,
    questions: serializeEnquiryQuestions(
      source.questions.map((question) => ({
        ...question,
        fieldKey: `${question.fieldKey}-${nextId.slice(0, 4)}`,
      })),
    ),
  });
  if (error) throw error;
  return nextId;
}

export async function setEnquiryFormStatus(id: string, status: EnquiryFormStatus) {
  const { error } = await supabase
    .from("enquiry_forms")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteEnquiryForm(id: string) {
  const form = await fetchEnquiryForm(id);
  if (!form) throw new Error("enquiry_form_not_found");
  if (form.isDefault) throw new Error("enquiry_form_default_protected");
  const { count, error: countError } = await supabase
    .from("enquiry_submissions")
    .select("id", { count: "exact", head: true })
    .eq("form_id", id);
  if (countError) throw countError;
  if (count) throw new Error("enquiry_form_has_submissions");
  const { data, error } = await supabase
    .from("enquiry_forms")
    .delete()
    .eq("id", id)
    .eq("is_default", false)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("enquiry_form_not_found");
}

export async function deleteEnquirySubmission(id: string) {
  const { data, error } = await supabase
    .from("enquiry_submissions")
    .delete()
    .eq("id", id)
    .is("converted_quote_id", null)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("enquiry_submission_not_deletable");
}

export async function fetchPendingEnquirySubmissions(search = ""): Promise<EnquirySubmissionListItem[]> {
  let query = supabase
    .from("enquiry_submissions")
    .select(
      "id,form_title,created_at,customer_name,salutation,company_name,phone,email,delivery_date_raw,quote_description,headcount,internal_email_status,ack_email_status,asana_status,asana_link",
    )
    .is("converted_quote_id", null)
    .order("created_at", { ascending: false })
    .limit(200);
  const keyword = search.trim();
  if (keyword) {
    query = query.or(
      [
        `customer_name.ilike.%${keyword}%`,
        `company_name.ilike.%${keyword}%`,
        `phone.ilike.%${keyword}%`,
        `email.ilike.%${keyword}%`,
        `quote_description.ilike.%${keyword}%`,
        `delivery_date_raw.ilike.%${keyword}%`,
      ].join(","),
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    formTitle: row.form_title,
    customerName: row.customer_name || "",
    salutation: row.salutation || "",
    companyName: row.company_name || "",
    phone: row.phone || "",
    email: row.email || "",
    deliveryDateRaw: row.delivery_date_raw || "",
    quoteDescription: row.quote_description || "",
    headcount: row.headcount || "",
    internalEmailStatus: row.internal_email_status,
    ackEmailStatus: row.ack_email_status,
    asanaStatus: row.asana_status,
    asanaLink: row.asana_link || "",
  }));
}

export async function fetchEnquirySubmission(
  id: string,
): Promise<EnquirySubmissionDetail | null> {
  const { data, error } = await supabase
    .from("enquiry_submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as SubmissionRow;
  return {
    id: row.id,
    formId: row.form_id,
    createdAt: row.created_at,
    formTitle: row.form_title,
    customerName: row.customer_name || "",
    salutation: row.salutation || "",
    companyName: row.company_name || "",
    phone: row.phone || "",
    email: row.email || "",
    deliveryDateRaw: row.delivery_date_raw || "",
    quoteDescription: row.quote_description || "",
    headcount: row.headcount || "",
    internalEmailStatus: row.internal_email_status,
    ackEmailStatus: row.ack_email_status,
    asanaStatus: row.asana_status,
    asanaLink: row.asana_link || "",
    formSnapshot: parseEnquiryQuestions(row.form_snapshot),
    answers: (row.answers ?? {}) as EnquiryAnswers,
    originalAnswers: (row.original_answers ?? row.answers ?? {}) as EnquiryAnswers,
    convertedQuoteId: row.converted_quote_id,
  };
}

export async function saveEnquirySubmissionAnswers(
  id: string,
  questions: EnquiryQuestion[],
  answers: EnquiryAnswers,
) {
  const mapped = mapEnquiryAnswers(questions, answers);
  const { error } = await supabase
    .from("enquiry_submissions")
    .update({
      answers,
      customer_name: mapped.customerName || null,
      salutation: mapped.salutation || null,
      company_name: mapped.companyName || null,
      phone: mapped.phone || null,
      email: mapped.email || null,
      shipping_address: mapped.address || null,
      delivery_date_raw: mapped.deliveryDateRaw || null,
      delivery_date: mapped.deliveryDate,
      delivery_time: mapped.deliveryTime || null,
      headcount: mapped.headcount || null,
      quote_description: mapped.quoteDescription || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("converted_quote_id", null);
  if (error) throw error;
}

export async function convertEnquiryToQuote(input: {
  submissionId: string;
  channelId: string;
}) {
  const { data, error } = await supabase.rpc("convert_enquiry_to_quote", {
    p_submission_id: input.submissionId,
    p_channel_id: input.channelId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error("enquiry_convert_failed");
  return { id: row.id as string, orderNumber: String(row.order_number ?? "") };
}

export async function fetchEnquirySubmissionForQuote(quoteId: string) {
  const { data, error } = await supabase
    .from("enquiry_submissions")
    .select("*")
    .eq("converted_quote_id", quoteId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return fetchEnquirySubmission(data.id);
}
