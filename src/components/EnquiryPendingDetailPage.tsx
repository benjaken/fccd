import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardList, ChevronLeft, FileText, PackagePlus } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { EnquiryFormFields } from "@/components/EnquiryFormFields";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FilterableSelect } from "@/components/ui/filterable-select";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  convertEnquiryRequirements,
  mapEnquiryAnswers,
  type EnquiryAnswerValue,
  type EnquiryAnswers,
} from "@/lib/enquiry-form";
import {
  convertEnquiryToQuote,
  fetchEnquirySubmission,
  notifyEnquirySubmission,
  saveEnquirySubmissionAnswers,
  type EnquirySubmissionDetail,
} from "@/lib/enquiry-forms-api";
import { fetchQuoteBrands, type QuoteBrandOption } from "@/lib/quotes";
import { cn } from "@/lib/utils";

import "./enquiry-form.css";

type PendingSection = "enquiry" | "details" | "items";

function notificationLabel(kind: "internal" | "ack", value: string) {
  if (kind === "internal") {
    if (value === "sent") return "已通知";
    if (value === "failed") return "通知失敗";
    if (value === "sending") return "寄送中";
    return "尚未通知";
  }
  if (value === "sent") return "已寄出";
  if (value === "failed") return "失敗";
  if (value === "no_email") return "無電郵";
  if (value === "sending") return "寄送中";
  return "尚未寄出";
}

export function EnquiryPendingDetailPage({ canManage = false }: { canManage?: boolean }) {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const nav = searchParams.get("nav");
  const backTo = `/quotes/pending${nav ? `?nav=${encodeURIComponent(nav)}` : "?nav=catering.quotes"}`;
  const [detail, setDetail] = useState<EnquirySubmissionDetail | null>(null);
  const [answers, setAnswers] = useState<EnquiryAnswers>({});
  const [brands, setBrands] = useState<QuoteBrandOption[]>([]);
  const [channelId, setChannelId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [mailBusy, setMailBusy] = useState<"internal" | "ack" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [activeTab, setActiveTab] = useState<PendingSection>("enquiry");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchEnquirySubmission(id), fetchQuoteBrands()])
      .then(([next, brandOptions]) => {
        if (cancelled) return;
        setDetail(next);
        setAnswers(next?.answers ?? {});
        setBrands(brandOptions);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const mapped = useMemo(
    () => (detail ? mapEnquiryAnswers(detail.formSnapshot, answers) : null),
    [detail, answers],
  );

  const save = async () => {
    if (!detail || !canManage) return;
    setSaving(true);
    setError(null);
    try {
      await saveEnquirySubmissionAnswers(detail.id, detail.formSnapshot, answers);
      const next = await fetchEnquirySubmission(detail.id);
      setDetail(next);
    } catch {
      setError("儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const resendMail = async (kind: "internal" | "ack") => {
    if (!detail || !canManage) return;
    setMailBusy(kind);
    setError(null);
    try {
      const result = await notifyEnquirySubmission(detail.id, { force: true, kind });
      setDetail((current) =>
        current
          ? {
              ...current,
              internalEmailStatus: result.internalEmailStatus || current.internalEmailStatus,
              internalWatiStatus: result.internalWatiStatus || current.internalWatiStatus,
              ackEmailStatus: result.ackEmailStatus || current.ackEmailStatus,
            }
          : current,
      );
    } catch {
      setError("寄信失敗");
    } finally {
      setMailBusy(null);
    }
  };

  const convert = async () => {
    if (!detail || !mapped) return;
    const missing = convertEnquiryRequirements(mapped);
    if (!channelId) missing.push("品牌");
    if (missing.length) {
      setError(`轉成報價前請補：${missing.join("、")}`);
      setConfirmOpen(false);
      return;
    }
    setConverting(true);
    setError(null);
    try {
      await saveEnquirySubmissionAnswers(detail.id, detail.formSnapshot, answers);
      const quote = await convertEnquiryToQuote({ submissionId: detail.id, channelId });
      navigate(`/quotes/${quote.id}/edit${nav ? `?nav=${encodeURIComponent(nav)}` : "?nav=catering.quotes"}`);
    } catch {
      setError("轉成報價單失敗");
    } finally {
      setConverting(false);
      setConfirmOpen(false);
    }
  };

  const submitHeader = (event: FormEvent) => {
    event.preventDefault();
    void save();
  };

  const scrollToSection = (section: PendingSection) => {
    setActiveTab(section);
    document.getElementById(`enquiry-pending-${section}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  if (loading) {
    return (
      <PageSkeleton
        detailLayout="document"
        documentType="quote"
        documentMode="edit"
        label={t("quoteEditor.loading")}
        variant="detail"
      />
    );
  }

  if (!detail) {
    return (
      <section className="quote-editor-page">
        <header className="page-heading quote-editor-heading">
          <div>
            <Link className="detail-back" to={backTo}>
              <ChevronLeft />
              {t("quoteEditor.pendingBack")}
            </Link>
            <span className="eyebrow">{t("quoteEditor.pendingEyebrow")}</span>
            <h1>{t("quoteEditor.pendingNotFound")}</h1>
          </div>
        </header>
      </section>
    );
  }

  if (detail.convertedQuoteId) {
    return (
      <section className="quote-editor-page">
        <header className="page-heading quote-editor-heading">
          <div>
            <Link className="detail-back" to={backTo}>
              <ChevronLeft />
              {t("quoteEditor.pendingBack")}
            </Link>
            <span className="eyebrow">{t("quoteEditor.pendingEyebrow")}</span>
            <h1>{detail.referenceCode || t("quoteEditor.pendingConverted")}</h1>
            <p>{t("quoteEditor.pendingConverted")}</p>
          </div>
        </header>
        <Button asChild>
          <Link to={`/quotes/${detail.convertedQuoteId}/edit?nav=catering.quotes`}>
            {t("quoteEditor.pendingOpenQuote")}
          </Link>
        </Button>
      </section>
    );
  }

  const displayName = `${detail.salutation}${detail.customerName}`.trim();

  return (
    <section className="quote-editor-page">
      <header className="page-heading quote-editor-heading">
        <div>
          <Link className="detail-back" to={backTo}>
            <ChevronLeft />
            {t("quoteEditor.pendingBack")}
          </Link>
          <span className="eyebrow">{t("quoteEditor.pendingEyebrow")}</span>
          <div className="order-number-cell">
            <h1>{detail.referenceCode || displayName || t("quoteEditor.pendingEyebrow")}</h1>
          </div>
          <p>{[detail.formTitle, displayName].filter(Boolean).join(" · ")}</p>
        </div>
      </header>
      {error ? <p className="quote-editor-error" role="alert">{error}</p> : null}

      <nav
        className="quote-editor-tabs quote-editor-section-navigation is-quote has-enquiry"
        aria-label={t("quoteEditor.steps.label")}
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-label={t("quoteEditor.steps.enquiry")}
          aria-controls="enquiry-pending-enquiry"
          aria-selected={activeTab === "enquiry"}
          className={cn(activeTab === "enquiry" && "is-active")}
          onClick={() => scrollToSection("enquiry")}
        >
          <span><ClipboardList /></span>
          <div>
            <small>{t("quoteEditor.steps.number", { number: 1 })}</small>
            <strong>{t("quoteEditor.steps.enquiry")}</strong>
          </div>
        </button>
        <button
          type="button"
          role="tab"
          aria-label={t("quoteEditor.steps.details")}
          aria-controls="enquiry-pending-details"
          aria-selected={activeTab === "details"}
          className={cn(activeTab === "details" && "is-active")}
          onClick={() => scrollToSection("details")}
        >
          <span><FileText /></span>
          <div>
            <small>{t("quoteEditor.steps.number", { number: 2 })}</small>
            <strong>{t("quoteEditor.steps.details")}</strong>
          </div>
        </button>
        <button
          type="button"
          role="tab"
          aria-label={t("quoteEditor.steps.items")}
          aria-controls="enquiry-pending-items"
          aria-selected={activeTab === "items"}
          className={cn(activeTab === "items" && "is-active")}
          onClick={() => scrollToSection("items")}
        >
          <span><PackagePlus /></span>
          <div>
            <small>{t("quoteEditor.steps.number", { number: 3 })}</small>
            <strong>{t("quoteEditor.steps.items")}</strong>
          </div>
        </button>
      </nav>

      <section
        id="enquiry-pending-enquiry"
        className="panel quote-editor-enquiry-step quote-editor-scroll-section"
      >
        <h2><ClipboardList />{t("quoteEditor.steps.enquiry")}</h2>
        <EnquiryFormFields
          questions={detail.formSnapshot}
          answers={answers}
          disabled={!canManage}
          splitLayout
          onChange={(fieldKey, value: EnquiryAnswerValue) =>
            setAnswers((current) => ({ ...current, [fieldKey]: value }))
          }
        />
        <Button type="button" variant="ghost" onClick={() => setShowOriginal((open) => !open)}>
          {showOriginal ? "隱藏首次提交副本" : "查看首次提交副本"}
        </Button>
        {showOriginal ? (
          <EnquiryFormFields questions={detail.formSnapshot} answers={detail.originalAnswers} disabled splitLayout />
        ) : null}
      </section>

      <form
        id="enquiry-pending-details"
        className="panel quote-editor-form quote-editor-scroll-section"
        onSubmit={submitHeader}
      >
        <div className="quote-editor-form-column">
          <h2><FileText />{t("quoteEditor.customerSection")}</h2>
          <label>
            <span>{t("quoteEditor.fields.number")}</span>
            <input value={detail.referenceCode || "—"} disabled />
          </label>
          <label>
            <span>{t("quoteEditor.fields.brand")} *</span>
            <FilterableSelect
              required
              value={channelId}
              onChange={(event) => setChannelId(event.target.value)}
              disabled={!canManage}
            >
              <option value="">{t("quoteEditor.placeholders.brand")}</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>{brand.name}</option>
              ))}
            </FilterableSelect>
          </label>
          <label>
            <span>{t("quoteEditor.fields.customerName")}</span>
            <input value={mapped?.customerName ?? ""} disabled />
          </label>
          <label>
            <span>{t("quoteEditor.fields.companyName")}</span>
            <input value={mapped?.companyName ?? ""} disabled />
          </label>
          <label>
            <span>{t("quoteEditor.fields.contactA")}</span>
            <input value={mapped?.phone ?? ""} disabled />
          </label>
          <label>
            <span>{t("quoteEditor.fields.email")}</span>
            <input value={mapped?.email ?? ""} disabled />
          </label>
          <label>
            <span>{t("quoteEditor.fields.asanaLink")}</span>
            <input value={detail.asanaLink || ""} disabled />
          </label>
          <div className="quote-editor-address-field">
            <label htmlFor="enquiry-pending-address">{t("quoteEditor.fields.address")}</label>
            <textarea id="enquiry-pending-address" rows={2} value={mapped?.address ?? ""} disabled />
          </div>
        </div>

        <div className="quote-editor-form-column">
          <h2><PackagePlus />{t("quoteEditor.deliverySection")}</h2>
          <label>
            <span>{t("quoteEditor.fields.deliveryDate")}</span>
            <input value={mapped?.deliveryDateRaw ?? ""} disabled />
          </label>
          <label>
            <span>{t("quoteEditor.fields.deliveryTime")}</span>
            <input value={mapped?.deliveryTime ?? ""} disabled />
          </label>
          <label>
            <span>{t("quoteEditor.pendingHeadcount")}</span>
            <input value={mapped?.headcount ?? ""} disabled />
          </label>
          <div className="quote-editor-pending-notes">
            <p>內部通知：{notificationLabel("internal", detail.internalEmailStatus)}</p>
            <p>內部 WhatsApp：{notificationLabel("internal", detail.internalWatiStatus)}</p>
            {canManage ? (
              <Button type="button" variant="outline" disabled={mailBusy !== null} onClick={() => void resendMail("internal")}>
                {mailBusy === "internal" ? "寄送中…" : "重寄內部通知"}
              </Button>
            ) : null}
            <p>對客確認：{notificationLabel("ack", detail.ackEmailStatus)}</p>
            {canManage && detail.ackEmailStatus !== "no_email" ? (
              <Button type="button" variant="outline" disabled={mailBusy !== null} onClick={() => void resendMail("ack")}>
                {mailBusy === "ack" ? "寄送中…" : "重寄對客確認"}
              </Button>
            ) : null}
          </div>
        </div>

        {canManage ? (
          <footer>
            <Button type="button" variant="outline" disabled={converting || saving} onClick={() => setConfirmOpen(true)}>
              轉成報價單
            </Button>
            <Button type="submit" disabled={saving || converting}>
              {saving ? t("quoteEditor.saving") : t("quoteEditor.saveChanges")}
            </Button>
          </footer>
        ) : null}
      </form>

      <section
        id="enquiry-pending-items"
        className="panel quote-editor-enquiry-step quote-editor-scroll-section"
      >
        <h2><PackagePlus />{t("quoteEditor.steps.items")}</h2>
        <p>{t("quoteEditor.pendingItemsHint")}</p>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        title="轉成報價單"
        description={
          <div>
            <p>客戶：{`${mapped?.salutation ?? ""}${mapped?.customerName ?? ""}`}</p>
            <p>日期：{mapped?.deliveryDateRaw || "—"}</p>
            <p>表單：{detail.formTitle}</p>
            <p>品牌：{brands.find((brand) => brand.id === channelId)?.name || "尚未選擇"}</p>
          </div>
        }
        confirmLabel="確認轉成報價單"
        cancelLabel="取消"
        busy={converting}
        busyLabel="轉換中…"
        closeLabel="關閉"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void convert()}
      />
    </section>
  );
}
