import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { EnquiryFormFields } from "@/components/EnquiryFormFields";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FilterableSelect } from "@/components/ui/filterable-select";
import { Input } from "@/components/ui/input";
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

import "./enquiry-form.css";

export function EnquiryPendingDetailPage({ canManage = false }: { canManage?: boolean }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
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
      navigate(`/quotes/${quote.id}/edit?nav=catering.quotes`);
    } catch {
      setError("轉成報價單失敗");
    } finally {
      setConverting(false);
      setConfirmOpen(false);
    }
  };

  if (loading) return <section className="enquiry-pending-page">載入待報價…</section>;
  if (!detail) return <section className="enquiry-pending-page">找不到此待報價</section>;
  if (detail.convertedQuoteId) {
    return (
      <section className="enquiry-pending-page">
        <p>此筆已轉成報價單。</p>
        <Button asChild><Link to={`/quotes/${detail.convertedQuoteId}`}>開啟報價單</Link></Button>
      </section>
    );
  }

  const displayName = `${detail.salutation}${detail.customerName}`.trim();

  return (
    <section className="enquiry-pending-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">待轉報價</span>
          <h1>{detail.referenceCode || displayName || "待報價詳情"}</h1>
          <p>{[detail.formTitle, displayName].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="enquiry-pending-toolbar">
          {canManage ? (
            <>
              <Button type="button" variant="outline" disabled={saving} onClick={() => void save()}>
                {saving ? "儲存中…" : "儲存"}
              </Button>
              <Button type="button" onClick={() => setConfirmOpen(true)}>轉成報價單</Button>
            </>
          ) : null}
          <Button asChild variant="ghost"><Link to="/quotes/pending?nav=catering.quotes">返回列表</Link></Button>
        </div>
      </header>
      {error ? <p role="alert">{error}</p> : null}

      <section className="enquiry-builder-card">
        <h2>Enquiry Form 的資料</h2>
        <EnquiryFormFields
          questions={detail.formSnapshot}
          answers={answers}
          disabled={!canManage}
          onChange={(fieldKey, value: EnquiryAnswerValue) =>
            setAnswers((current) => ({ ...current, [fieldKey]: value }))
          }
        />
        <Button type="button" variant="ghost" onClick={() => setShowOriginal((open) => !open)}>
          {showOriginal ? "隱藏首次提交副本" : "查看首次提交副本"}
        </Button>
        {showOriginal ? (
          <EnquiryFormFields questions={detail.formSnapshot} answers={detail.originalAnswers} disabled />
        ) : null}
      </section>

      <section className="enquiry-builder-card">
        <h2>報價資料</h2>
        <label>
          品牌 *
          <FilterableSelect value={channelId} onChange={(event) => setChannelId(event.target.value)} disabled={!canManage}>
            <option value="">請選擇品牌</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>{brand.name}</option>
            ))}
          </FilterableSelect>
        </label>
        <label>姓名<Input value={mapped?.customerName ?? ""} disabled /></label>
        <label>稱謂<Input value={mapped?.salutation ?? ""} disabled /></label>
        <label>公司<Input value={mapped?.companyName ?? ""} disabled /></label>
        <label>電話<Input value={mapped?.phone ?? ""} disabled /></label>
        <label>電郵<Input value={mapped?.email ?? ""} disabled /></label>
        <label>地址<Input value={mapped?.address ?? ""} disabled /></label>
        <label>日期<Input value={mapped?.deliveryDateRaw ?? ""} disabled /></label>
        <label>時段<Input value={mapped?.deliveryTime ?? ""} disabled /></label>
        <label>人數<Input value={mapped?.headcount ?? ""} disabled /></label>
        <p>內部通知：{detail.internalEmailStatus === "sent" ? "已通知" : detail.internalEmailStatus === "failed" ? "通知失敗" : detail.internalEmailStatus === "sending" ? "寄送中" : "尚未通知"}</p>
        {canManage ? (
          <Button type="button" variant="outline" disabled={mailBusy !== null} onClick={() => void resendMail("internal")}>
            {mailBusy === "internal" ? "寄送中…" : "重寄內部通知"}
          </Button>
        ) : null}
        <p>對客確認：{detail.ackEmailStatus === "sent" ? "已寄出" : detail.ackEmailStatus === "failed" ? "失敗" : detail.ackEmailStatus === "no_email" ? "無電郵" : detail.ackEmailStatus === "sending" ? "寄送中" : "尚未寄出"}</p>
        {canManage && detail.ackEmailStatus !== "no_email" ? (
          <Button type="button" variant="outline" disabled={mailBusy !== null} onClick={() => void resendMail("ack")}>
            {mailBusy === "ack" ? "寄送中…" : "重寄對客確認"}
          </Button>
        ) : null}
        <p>Asana：{detail.asanaLink || "尚未建立"}（第一版稍後接自動建 task）</p>
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
