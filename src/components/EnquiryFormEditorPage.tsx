import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { Ban, ChevronLeft, Copy, ExternalLink, Eye, FilePenLine, FileText, Globe, GripVertical, Plus, Save } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { EnquiryFormFields } from "@/components/EnquiryFormFields";
import { Button } from "@/components/ui/button";
import { FilterableSelect } from "@/components/ui/filterable-select";
import { Modal } from "@/components/ui/modal";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  emptyAnswers,
  enquiryFormEditorPath,
  enquiryPublicPath,
  NEW_ENQUIRY_FORM_ID,
  reorderEnquiryQuestions,
  type EnquiryFormDefinition,
  type EnquiryQuestion,
  type EnquiryQuestionType,
  type EnquiryQuoteField,
} from "@/lib/enquiry-form";
import { createBlankEnquiryForm } from "@/lib/enquiry-form-seed";
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
    inputFormat: type === "input" ? "general" : undefined,
    options: type === "radio" || type === "checkbox" ? [{ label: "選項 1", value: "選項 1" }] : [],
  };
}

function questionWithType(question: EnquiryQuestion, type: EnquiryQuestionType): EnquiryQuestion {
  if (question.type === type) return question;
  return {
    ...question,
    type,
    inputFormat: type === "input" ? question.inputFormat ?? "general" : undefined,
    minNumber: type === "number" ? question.minNumber : undefined,
    maxNumber: type === "number" ? question.maxNumber : undefined,
    requireAllOptions: type === "checkbox" ? question.requireAllOptions : undefined,
    options:
      type === "radio" || type === "checkbox"
        ? question.options?.length
          ? question.options
          : [{ label: "選項 1", value: "選項 1" }]
        : [],
  };
}

function statusLabel(status: EnquiryFormDefinition["status"]) {
  if (status === "published") return "已發佈";
  if (status === "disabled") return "已停用";
  return "草稿";
}

function statusBadgeTone(status: EnquiryFormDefinition["status"]) {
  if (status === "published") return "green";
  if (status === "disabled") return "neutral";
  return "amber";
}

export function EnquiryFormEditorPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nav = searchParams.get("nav");
  const isNew = id === NEW_ENQUIRY_FORM_ID;
  const [form, setForm] = useState<EnquiryFormDefinition | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (isNew) {
      const draft = createBlankEnquiryForm();
      setForm(draft);
      setSelectedKey(draft.questions[0]?.fieldKey ?? null);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchEnquiryForm(id)
      .then((next) => {
        if (cancelled) return;
        if (!next) {
          setForm(null);
          return;
        }
        setForm(next);
        setSelectedKey(next.questions[0]?.fieldKey ?? null);
      })
      .catch(() => {
        if (!cancelled) setForm(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

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

  const addQuestion = () => {
    const question = newQuestion("input");
    setForm((current) =>
      current ? { ...current, questions: [...current.questions, question] } : current,
    );
    setSelectedKey(question.fieldKey);
  };

  const allowQuestionDrop = (event: DragEvent<HTMLTableRowElement>, fieldKey: string) => {
    if (!draggedKey) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverKey(fieldKey);
  };

  const dropQuestion = (targetKey: string) => {
    if (!draggedKey || draggedKey === targetKey) return;
    setForm((current) =>
      current
        ? { ...current, questions: reorderEnquiryQuestions(current.questions, draggedKey, targetKey) }
        : current,
    );
    setSelectedKey(draggedKey);
    setDraggedKey(null);
    setDragOverKey(null);
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
      const persistedId = isNew ? crypto.randomUUID() : next.id;
      const persisted = isNew
        ? {
            ...next,
            id: persistedId,
            slug: next.slug.trim() || `form-${persistedId.slice(0, 8)}`,
          }
        : next;
      await saveEnquiryForm(persisted);
      setForm(persisted);
      if (isNew) {
        navigate(enquiryFormEditorPath(persisted.id, nav), { replace: true });
      }
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
          </div>
          <p>維護公開查詢表單。第一份預設表單對照現行 EmailMeForm 24 題。</p>
        </div>
        <div className="heading-actions quote-detail-actions">
          {form.status === "published" ? (
            <Button asChild variant="outline">
              <Link to={enquiryPublicPath(form.id)} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                公開連結
              </Link>
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>
            <Eye />
            預覽
          </Button>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            <Save />
            {saving ? "儲存中…" : "儲存"}
          </Button>
          {form.status === "published" ? (
            <Button type="button" variant="outline" onClick={() => void save("disabled")}>
              <Ban />
              停用
            </Button>
          ) : (
            <Button type="button" onClick={() => void save("published")}>
              <Globe />
              發佈
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={isNew}
            onClick={async () => {
              const nextId = await duplicateEnquiryForm(form.id);
              navigate(enquiryFormEditorPath(nextId, nav || "catering.quotes"));
            }}
          >
            <Copy />
            複製
          </Button>
          <span className={cn("status-badge", statusBadgeTone(form.status))}>
            {statusLabel(form.status)}
          </span>
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
          <label>
            <span>對客確認主旨</span>
            <input
              value={form.ackEmailSubject}
              placeholder={t("quotes.enquiryAckSubjectPlaceholder")}
              onChange={(event) => patchForm({ ackEmailSubject: event.target.value })}
            />
          </label>
          <label>
            <span>對客確認正文<small>可用 {"{姓名}"} {"{稱謂}"} {"{表單標題}"}</small></span>
            <textarea
              rows={6}
              value={form.ackEmailBody}
              placeholder={t("quotes.enquiryAckBodyPlaceholder")}
              onChange={(event) => patchForm({ ackEmailBody: event.target.value })}
            />
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
                <FilterableSelect
                  aria-label="題型"
                  value={selected.type}
                  onChange={(event) =>
                    patchQuestion(
                      selected.fieldKey,
                      questionWithType(selected, event.target.value as EnquiryQuestionType),
                    )
                  }
                >
                  {QUESTION_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </FilterableSelect>
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
              <label>
                <span>必填</span>
                <div className="enquiry-editor-switch">
                  <Switch
                    checked={selected.required}
                    onCheckedChange={(checked) => patchQuestion(selected.fieldKey, { required: checked })}
                    aria-label="必填"
                  />
                </div>
              </label>
              {selected.type === "checkbox" ? (
                <label>
                  <span>必須全選</span>
                  <div className="enquiry-editor-switch">
                    <Switch
                      checked={selected.requireAllOptions === true}
                      onCheckedChange={(checked) =>
                        patchQuestion(selected.fieldKey, { requireAllOptions: checked })
                      }
                      aria-label="必須全選"
                    />
                  </div>
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
            <p className="enquiry-editor-empty-hint">從右側題目列表選一題，或按新增題目。</p>
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
            <Button type="button" onClick={addQuestion}>
              <Plus />
              新增題目
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
                    className={cn(
                      selectedKey === question.fieldKey && "is-selected",
                      draggedKey === question.fieldKey && "is-dragging",
                      dragOverKey === question.fieldKey && draggedKey !== question.fieldKey && "is-drag-over",
                    )}
                    onDragOver={(event) => allowQuestionDrop(event, question.fieldKey)}
                    onDragLeave={() => setDragOverKey((current) => (current === question.fieldKey ? null : current))}
                    onDrop={(event) => {
                      event.preventDefault();
                      dropQuestion(question.fieldKey);
                    }}
                  >
                    <td className="quote-line-sequence">
                      <button
                        type="button"
                        className="quote-line-drag-handle"
                        draggable
                        aria-label={`調整題目順序 ${index + 1} ${question.title}`}
                        onDragStart={(event) => {
                          setDraggedKey(question.fieldKey);
                          setSelectedKey(question.fieldKey);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", question.fieldKey);
                        }}
                        onDragEnd={() => {
                          setDraggedKey(null);
                          setDragOverKey(null);
                        }}
                      >
                        <GripVertical />
                        <span>{index + 1}</span>
                      </button>
                    </td>
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
                      <span>請按新增題目。</span>
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
