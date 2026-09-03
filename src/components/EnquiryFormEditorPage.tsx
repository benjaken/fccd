import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, FilePenLine, FileText, Globe, Plus } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { EnquiryFormFields } from "@/components/EnquiryFormFields";
import { Button } from "@/components/ui/button";
import { FilterableSelect } from "@/components/ui/filterable-select";
import { Modal } from "@/components/ui/modal";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  emptyAnswers,
  enquiryPublicPath,
  type EnquiryFormDefinition,
  type EnquiryQuestion,
  type EnquiryQuestionType,
  type EnquiryQuoteField,
} from "@/lib/enquiry-form";
import { cloneCateringEnquirySeedQuestions, CATERING_ENQUIRY_SEED_FORM_ID } from "@/lib/enquiry-form-seed";
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

function typeLabel(type: EnquiryQuestionType) {
  return QUESTION_TYPES.find((item) => item.value === type)?.label ?? type;
}

function quoteFieldLabel(field: EnquiryQuestion["quoteField"]) {
  return QUOTE_FIELDS.find((item) => item.value === (field ?? ""))?.label ?? "不對應";
}

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

function statusLabel(status: EnquiryFormDefinition["status"]) {
  if (status === "published") return "已發佈";
  if (status === "disabled") return "已停用";
  return "草稿";
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
        if (!next) {
          setForm(null);
          return;
        }
        const shouldHydrate =
          next.questions.length === 0
          || (next.id === CATERING_ENQUIRY_SEED_FORM_ID && next.questions.length !== 24);
        const questions = shouldHydrate
          ? cloneCateringEnquirySeedQuestions()
          : next.questions;
        const hydrated = { ...next, questions };
        setForm(hydrated);
        setSelectedKey(questions[0]?.fieldKey ?? null);
        if (shouldHydrate) {
          void saveEnquiryForm(hydrated);
        }
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

  const loadEmailMeFormQuestions = () => {
    const questions = cloneCateringEnquirySeedQuestions();
    patchForm({ questions });
    setSelectedKey(questions[0]?.fieldKey ?? null);
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

  if (loading) {
    return (
      <PageSkeleton
        label="載入編輯頁"
        variant="detail"
        documentType="quote"
        documentMode="edit"
      />
    );
  }
  if (!form) {
    return (
      <section className="quote-editor-page enquiry-editor-page">
        <header className="page-heading quote-editor-heading">
          <div>
            <Link className="detail-back" to="/quotes/enquiry-forms?nav=catering.quotes">
              <ChevronLeft />
              返回列表
            </Link>
            <span className="eyebrow">Enquiry 表單</span>
            <h1>找不到表單</h1>
          </div>
        </header>
      </section>
    );
  }

  const selectedIndex = selected
    ? form.questions.findIndex((question) => question.fieldKey === selected.fieldKey)
    : -1;

  return (
    <section className="quote-editor-page enquiry-editor-page">
      <header className="page-heading quote-editor-heading">
        <div>
          <Link className="detail-back" to="/quotes/enquiry-forms?nav=catering.quotes">
            <ChevronLeft />
            返回列表
          </Link>
          <span className="eyebrow">到會 · 報價單</span>
          <div className="order-number-cell">
            <h1>{form.internalName || "編輯表單"}</h1>
            <span className={`status-badge ${form.status === "published" ? "green" : form.status === "disabled" ? "" : "amber"}`}>
              {statusLabel(form.status)}
            </span>
          </div>
          <p>維護公開查詢表單。第一份預設表單對照現行 EmailMeForm 24 題。</p>
        </div>
        <div className="quote-detail-actions">
          {form.status === "published" ? (
            <Button asChild variant="outline">
              <Link to={enquiryPublicPath(form.id)} target="_blank" rel="noopener noreferrer">
                公開連結
              </Link>
            </Button>
          ) : null}
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
        </div>
      </header>
      {error ? <p className="quote-editor-error" role="alert">{error}</p> : null}

      <section className="panel quote-editor-form">
        <div className="quote-editor-form-column">
          <h2><FileText />表單資料</h2>
          <label>
            <span>內部名稱</span>
            <input value={form.internalName} onChange={(event) => patchForm({ internalName: event.target.value })} />
          </label>
          <label>
            <span>送出按鈕</span>
            <input value={form.submitLabel} onChange={(event) => patchForm({ submitLabel: event.target.value })} />
          </label>
          <label>
            <span>Slug</span>
            <input value={form.slug} onChange={(event) => patchForm({ slug: event.target.value })} />
          </label>
          <label>
            <span>預設公開表單</span>
            <div className="enquiry-editor-switch">
              <Switch checked={form.isDefault} onCheckedChange={(checked) => patchForm({ isDefault: checked })} />
            </div>
          </label>
        </div>
        <div className="quote-editor-form-column">
          <h2><Globe />公開頁面</h2>
          <label>
            <span>公開連結</span>
            {form.status === "published" ? (
              <Link className="order-link" to={enquiryPublicPath(form.id)} target="_blank" rel="noopener noreferrer">
                {enquiryPublicPath(form.id)}
              </Link>
            ) : (
              <span>—</span>
            )}
          </label>
          <label>
            <span>公開標題</span>
            <input value={form.publicTitle} onChange={(event) => patchForm({ publicTitle: event.target.value })} />
          </label>
          <label>
            <span>公開說明</span>
            <textarea rows={4} value={form.publicDescription} onChange={(event) => patchForm({ publicDescription: event.target.value })} />
          </label>
          <label>
            <span>成功頁短訊</span>
            <textarea rows={4} value={form.successMessage} onChange={(event) => patchForm({ successMessage: event.target.value })} />
          </label>
        </div>
      </section>

      <div className="quote-items-layout">
        <form
          className="panel quote-item-form"
          onSubmit={(event) => event.preventDefault()}
        >
          <header>
            <div>
              <span className="eyebrow">題目 {selectedIndex >= 0 ? selectedIndex + 1 : "—"} / {form.questions.length}</span>
              <h2><FilePenLine />題目設定</h2>
            </div>
          </header>
          {selected ? (
            <>
              <label>
                <span>標題</span>
                <input value={selected.title} onChange={(event) => patchQuestion(selected.fieldKey, { title: event.target.value })} />
              </label>
              <label>
                <span>提示</span>
                <input value={selected.hint ?? ""} onChange={(event) => patchQuestion(selected.fieldKey, { hint: event.target.value })} />
              </label>
              <label>
                <span>題型</span>
                <input value={typeLabel(selected.type)} disabled />
              </label>
              {selected.type === "input" ? (
                <label>
                  <span>格式</span>
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
                <div className="quote-item-numbers">
                  <label>
                    <span>最小</span>
                    <input
                      type="number"
                      value={selected.minNumber ?? ""}
                      onChange={(event) =>
                        patchQuestion(selected.fieldKey, {
                          minNumber: event.target.value ? Number(event.target.value) : undefined,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>最大</span>
                    <input
                      type="number"
                      value={selected.maxNumber ?? ""}
                      onChange={(event) =>
                        patchQuestion(selected.fieldKey, {
                          maxNumber: event.target.value ? Number(event.target.value) : undefined,
                        })
                      }
                    />
                  </label>
                </div>
              ) : null}
              <label>
                <span>對應報價欄</span>
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
              <label className="quote-editor-checkbox">
                <span>必填</span>
                <input
                  type="checkbox"
                  checked={selected.required}
                  onChange={(event) => patchQuestion(selected.fieldKey, { required: event.target.checked })}
                />
              </label>
              {selected.type === "checkbox" ? (
                <label className="quote-editor-checkbox">
                  <span>必須全選</span>
                  <input
                    type="checkbox"
                    checked={selected.requireAllOptions === true}
                    onChange={(event) => patchQuestion(selected.fieldKey, { requireAllOptions: event.target.checked })}
                  />
                </label>
              ) : null}
              {selected.type === "radio" || selected.type === "checkbox" ? (
                <label>
                  <span>選項<small>一行一個</small></span>
                  <textarea
                    rows={8}
                    value={(selected.options ?? []).map((option) => option.label).join("\n")}
                    onChange={(event) => {
                      const options = event.target.value.split("\n").filter((line) => line.trim()).map((label) => {
                        const existing = (selected.options ?? []).find((option) => option.label === label);
                        return { label, value: label, defaultChecked: existing?.defaultChecked };
                      });
                      patchQuestion(selected.fieldKey, { options });
                    }}
                  />
                </label>
              ) : null}
              <div className="enquiry-editor-question-actions">
                <Button
                  type="button"
                  variant="outline"
                  disabled={selectedIndex <= 0}
                  onClick={() => {
                    if (selectedIndex <= 0) return;
                    const next = [...form.questions];
                    [next[selectedIndex - 1], next[selectedIndex]] = [next[selectedIndex], next[selectedIndex - 1]];
                    patchForm({ questions: next });
                  }}
                >
                  上移
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={selectedIndex < 0 || selectedIndex >= form.questions.length - 1}
                  onClick={() => {
                    if (selectedIndex < 0 || selectedIndex >= form.questions.length - 1) return;
                    const next = [...form.questions];
                    [next[selectedIndex + 1], next[selectedIndex]] = [next[selectedIndex], next[selectedIndex + 1]];
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
            </>
          ) : (
            <p className="enquiry-editor-empty-hint">從右側題目列表選一題，或載入 EmailMeForm 範本。</p>
          )}
        </form>

        <article className="panel quote-lines-panel">
          <header>
            <div>
              <span className="eyebrow">公開表單題目</span>
              <h2>題目列表</h2>
            </div>
            <strong>{form.questions.length}</strong>
          </header>
          <div className="enquiry-editor-list-toolbar">
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
            <Button type="button" variant="outline" onClick={loadEmailMeFormQuestions}>
              <Plus />
              載入 EmailMeForm 24 題
            </Button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>題目</th>
                  <th>題型</th>
                  <th>必填</th>
                  <th>對應欄</th>
                </tr>
              </thead>
              <tbody>
                {form.questions.map((question, index) => (
                  <tr
                    key={question.fieldKey}
                    className={cn(selectedKey === question.fieldKey && "is-selected")}
                  >
                    <td>{index + 1}</td>
                    <td>
                      <button
                        type="button"
                        className="enquiry-editor-question-name"
                        onClick={() => setSelectedKey(question.fieldKey)}
                      >
                        {question.title}
                      </button>
                    </td>
                    <td>{typeLabel(question.type)}</td>
                    <td>{question.required ? "是" : "否"}</td>
                    <td>{quoteFieldLabel(question.quoteField)}</td>
                  </tr>
                ))}
                {!form.questions.length ? (
                  <tr>
                    <td colSpan={5} className="quote-lines-empty">
                      <FilePenLine />
                      <strong>尚未有題目</strong>
                      <span>請新增，或載入 EmailMeForm 24 題。</span>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <Modal open={previewOpen} title="公開樣式預覽" closeLabel="關閉" onClose={() => setPreviewOpen(false)} size="lg">
        <EnquiryFormFields
          questions={form.questions}
          answers={emptyAnswers(form.questions)}
          splitLayout
          disabled
        />
      </Modal>
    </section>
  );
}
