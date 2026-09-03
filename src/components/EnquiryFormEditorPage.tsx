import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { EnquiryFormFields } from "@/components/EnquiryFormFields";
import { Button } from "@/components/ui/button";
import { FilterableSelect } from "@/components/ui/filterable-select";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import {
  emptyAnswers,
  type EnquiryFormDefinition,
  type EnquiryQuestion,
  type EnquiryQuestionType,
  type EnquiryQuoteField,
} from "@/lib/enquiry-form";
import {
  duplicateEnquiryForm,
  fetchEnquiryForm,
  saveEnquiryForm,
} from "@/lib/enquiry-forms-api";

import "./enquiry-form.css";

const QUESTION_TYPES: { value: EnquiryQuestionType; label: string }[] = [
  { value: "radio", label: "單選" },
  { value: "checkbox", label: "多選" },
  { value: "input", label: "輸入框" },
  { value: "textarea", label: "文本框" },
  { value: "date", label: "日期" },
  { value: "number", label: "數字輸入框" },
];

const QUOTE_FIELDS: { value: EnquiryQuoteField | ""; label: string }[] = [
  { value: "", label: "不對應" },
  { value: "customer_name", label: "客人姓名" },
  { value: "salutation", label: "稱謂" },
  { value: "company_name", label: "公司名稱" },
  { value: "phone", label: "主聯絡電話" },
  { value: "email", label: "電郵地址" },
  { value: "shipping_address", label: "送貨地址" },
  { value: "delivery_date", label: "送貨日期" },
  { value: "delivery_time", label: "送貨時間" },
  { value: "headcount", label: "人數" },
  { value: "quote_description", label: "報價描述" },
];

function newQuestion(type: EnquiryQuestionType): EnquiryQuestion {
  return {
    fieldKey: `q-${crypto.randomUUID().slice(0, 8)}`,
    type,
    title: "未命名題目",
    required: false,
    inputFormat: "general",
    options: type === "radio" || type === "checkbox" ? [{ label: "選項 1", value: "選項 1" }] : [],
  };
}

export function EnquiryFormEditorPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<EnquiryFormDefinition | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchEnquiryForm(id)
      .then((next) => {
        if (cancelled) return;
        setForm(next);
        setSelectedKey(next?.questions[0]?.fieldKey ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const selected = useMemo(
    () => form?.questions.find((question) => question.fieldKey === selectedKey) ?? null,
    [form, selectedKey],
  );

  const patchForm = (patch: Partial<EnquiryFormDefinition>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
  };

  const patchQuestion = (fieldKey: string, patch: Partial<EnquiryQuestion>) => {
    setForm((current) =>
      current
        ? {
            ...current,
            questions: current.questions.map((question) =>
              question.fieldKey === fieldKey ? { ...question, ...patch } : question,
            ),
          }
        : current,
    );
  };

  const save = async (nextStatus?: EnquiryFormDefinition["status"]) => {
    if (!form) return;
    if (!form.questions.length) {
      setError("發佈前至少需要一題");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const next = nextStatus ? { ...form, status: nextStatus } : form;
      await saveEnquiryForm(next);
      setForm(next);
    } catch {
      setError("儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section className="enquiry-builder-page">載入編輯頁…</section>;
  if (!form) return <section className="enquiry-builder-page">找不到表單</section>;

  return (
    <section className="enquiry-builder-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Enquiry 表單</span>
          <h1>{form.internalName || "編輯表單"}</h1>
        </div>
        <div className="enquiry-builder-toolbar">
          <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>預覽</Button>
          <Button type="button" variant="outline" disabled={saving} onClick={() => void save()}>
            {saving ? "儲存中…" : "儲存"}
          </Button>
          {form.status === "published" ? (
            <Button type="button" variant="outline" onClick={() => void save("disabled")}>停用</Button>
          ) : (
            <Button type="button" onClick={() => void save("published")}>發佈</Button>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={async () => {
              const nextId = await duplicateEnquiryForm(form.id);
              navigate(`/quotes/enquiry-forms/${nextId}/edit?nav=catering.quotes`);
            }}
          >
            複製
          </Button>
          <Button asChild variant="ghost"><Link to="/quotes/enquiry-forms?nav=catering.quotes">返回列表</Link></Button>
        </div>
      </header>
      {error ? <p role="alert">{error}</p> : null}

      <div className="enquiry-builder-card">
        <label>內部名稱<Input value={form.internalName} onChange={(event) => patchForm({ internalName: event.target.value })} /></label>
        <label>公開標題<Input value={form.publicTitle} onChange={(event) => patchForm({ publicTitle: event.target.value })} /></label>
        <label>公開說明<textarea className="enquiry-form-textarea" value={form.publicDescription} onChange={(event) => patchForm({ publicDescription: event.target.value })} /></label>
        <label>送出按鈕<Input value={form.submitLabel} onChange={(event) => patchForm({ submitLabel: event.target.value })} /></label>
        <label>Slug<Input value={form.slug} onChange={(event) => patchForm({ slug: event.target.value })} /></label>
        <label className="enquiry-form-option">
          <Switch checked={form.isDefault} onCheckedChange={(checked) => patchForm({ isDefault: checked })} />
          <span>預設公開表單（/quote-inquiry）</span>
        </label>
        <label>成功頁短訊<textarea className="enquiry-form-textarea" value={form.successMessage} onChange={(event) => patchForm({ successMessage: event.target.value })} /></label>
      </div>

      <div className="enquiry-builder-toolbar">
        <FilterableSelect
          aria-label="新增題型"
          value=""
          onChange={(event) => {
            const type = event.target.value as EnquiryQuestionType;
            if (!type) return;
            const question = newQuestion(type);
            patchForm({ questions: [...form.questions, question] });
            setSelectedKey(question.fieldKey);
          }}
        >
          <option value="">新增題目…</option>
          {QUESTION_TYPES.map((type) => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </FilterableSelect>
      </div>

      <div className="enquiry-question-list">
        {form.questions.map((question, index) => (
          <div
            key={question.fieldKey}
            className={`enquiry-question-row ${selectedKey === question.fieldKey ? "is-selected" : ""}`}
          >
            <button type="button" onClick={() => setSelectedKey(question.fieldKey)}>
              {index + 1}. {question.title}
            </button>
            <label className="enquiry-form-option">
              <Switch
                checked={question.required}
                onCheckedChange={(checked) => patchQuestion(question.fieldKey, { required: checked })}
              />
              必填
            </label>
          </div>
        ))}
      </div>

      {selected ? (
        <div className="enquiry-builder-card">
          <h2>題目設定</h2>
          <label>標題<Input value={selected.title} onChange={(event) => patchQuestion(selected.fieldKey, { title: event.target.value })} /></label>
          <label>提示<Input value={selected.hint ?? ""} onChange={(event) => patchQuestion(selected.fieldKey, { hint: event.target.value })} /></label>
          {selected.type === "input" ? (
            <label>
              格式
              <FilterableSelect
                value={selected.inputFormat ?? "general"}
                onChange={(event) =>
                  patchQuestion(selected.fieldKey, {
                    inputFormat: event.target.value as EnquiryQuestion["inputFormat"],
                  })
                }
              >
                <option value="general">一般</option>
                <option value="email">電郵</option>
                <option value="phone">電話</option>
              </FilterableSelect>
            </label>
          ) : null}
          {selected.type === "number" ? (
            <>
              <label>最小<Input type="number" value={selected.minNumber ?? ""} onChange={(event) => patchQuestion(selected.fieldKey, { minNumber: event.target.value ? Number(event.target.value) : undefined })} /></label>
              <label>最大<Input type="number" value={selected.maxNumber ?? ""} onChange={(event) => patchQuestion(selected.fieldKey, { maxNumber: event.target.value ? Number(event.target.value) : undefined })} /></label>
            </>
          ) : null}
          <label>
            對應報價欄
            <FilterableSelect
              value={selected.quoteField ?? ""}
              onChange={(event) =>
                patchQuestion(selected.fieldKey, {
                  quoteField: (event.target.value || null) as EnquiryQuoteField | null,
                })
              }
            >
              {QUOTE_FIELDS.map((field) => (
                <option key={field.value || "none"} value={field.value}>{field.label}</option>
              ))}
            </FilterableSelect>
          </label>
          {selected.type === "checkbox" ? (
            <label className="enquiry-form-option">
              <Switch
                checked={selected.requireAllOptions === true}
                onCheckedChange={(checked) => patchQuestion(selected.fieldKey, { requireAllOptions: checked })}
              />
              必須全選
            </label>
          ) : null}
          {selected.type === "radio" || selected.type === "checkbox" ? (
            <div>
              <p>選項（一行一個）</p>
              <textarea
                className="enquiry-form-textarea"
                value={(selected.options ?? []).map((option) => option.label).join("\n")}
                onChange={(event) => {
                  const options = event.target.value.split("\n").filter((line) => line.trim()).map((label) => {
                    const existing = (selected.options ?? []).find((option) => option.label === label);
                    return { label, value: label, defaultChecked: existing?.defaultChecked };
                  });
                  patchQuestion(selected.fieldKey, { options });
                }}
              />
            </div>
          ) : null}
          <div className="enquiry-builder-toolbar">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const index = form.questions.findIndex((question) => question.fieldKey === selected.fieldKey);
                if (index <= 0) return;
                const next = [...form.questions];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                patchForm({ questions: next });
              }}
            >
              上移
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const index = form.questions.findIndex((question) => question.fieldKey === selected.fieldKey);
                if (index < 0 || index >= form.questions.length - 1) return;
                const next = [...form.questions];
                [next[index + 1], next[index]] = [next[index], next[index + 1]];
                patchForm({ questions: next });
              }}
            >
              下移
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const next = form.questions.filter((question) => question.fieldKey !== selected.fieldKey);
                patchForm({ questions: next });
                setSelectedKey(next[0]?.fieldKey ?? null);
              }}
            >
              刪除此題
            </Button>
          </div>
        </div>
      ) : null}

      <Modal open={previewOpen} title="公開樣式預覽" closeLabel="關閉" onClose={() => setPreviewOpen(false)} size="lg">
        <EnquiryFormFields
          questions={form.questions}
          answers={emptyAnswers(form.questions)}
          disabled
        />
      </Modal>
    </section>
  );
}
