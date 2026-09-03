import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";

import { EnquiryFormFields } from "@/components/EnquiryFormFields";
import { Button } from "@/components/ui/button";
import { FOOD_CHANNEL_CATERING_LOGO_PATH } from "@/lib/brand-logo";
import {
  emptyAnswers,
  type EnquiryAnswerValue,
  type EnquiryAnswers,
  type EnquiryFieldError,
  type EnquiryFormDefinition,
} from "@/lib/enquiry-form";
import {
  fetchPublishedEnquiryForm,
  submitEnquiryForm,
} from "@/lib/enquiry-forms-api";

import "./enquiry-form.css";

export function PublicEnquiryFormPage() {
  const { formId } = useParams();
  const [form, setForm] = useState<EnquiryFormDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [answers, setAnswers] = useState<EnquiryAnswers>({});
  const [errors, setErrors] = useState<EnquiryFieldError[]>([]);
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);
  const idempotencyKey = useMemo(
    () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `enq-${Date.now()}`),
    [form?.id],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPublishedEnquiryForm(formId)
      .then((next) => {
        if (cancelled) return;
        if (!next) {
          setUnavailable(true);
          setForm(null);
          return;
        }
        setUnavailable(false);
        setForm(next);
        setAnswers(emptyAnswers(next.questions));
        setSubmittedCode(null);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [formId]);

  const patchAnswer = (fieldKey: string, value: EnquiryAnswerValue) => {
    setAnswers((current) => ({ ...current, [fieldKey]: value }));
    setErrors((current) => current.filter((error) => error.fieldKey !== fieldKey));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form || submitting) return;
    setSubmitting(true);
    setErrors([]);
    try {
      const result = await submitEnquiryForm({
        formId: form.id,
        answers,
        questions: form.questions,
        idempotencyKey,
        honeypot,
      });
      setSubmittedCode(result.referenceCode);
    } catch (error) {
      const fieldErrors = (error as { fieldErrors?: EnquiryFieldError[] }).fieldErrors;
      if (fieldErrors?.length) setErrors(fieldErrors);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="enquiry-public-page">
      <div className="enquiry-public-shell">
        <img className="enquiry-public-logo" src={FOOD_CHANNEL_CATERING_LOGO_PATH} alt="Food Channel Catering" />
        {loading ? <section className="enquiry-public-card">載入表單中…</section> : null}
        {!loading && unavailable ? (
          <section className="enquiry-public-card enquiry-public-unavailable">
            <h1>暫不接受查詢</h1>
            <p>此公開表單尚未發佈或暫時停用。請稍後再試，或與我們聯絡。</p>
          </section>
        ) : null}
        {!loading && form && submittedCode ? (
          <section className="enquiry-public-card enquiry-public-success">
            <h1>{form.publicTitle}</h1>
            <p>{form.successMessage || "我們已收到你的查詢，稍後會有專人回覆。"}</p>
            <p>參考編號：{submittedCode}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSubmittedCode(null);
                setAnswers(emptyAnswers(form.questions));
              }}
            >
              再填一筆
            </Button>
          </section>
        ) : null}
        {!loading && form && !submittedCode ? (
          <form className="enquiry-public-card" onSubmit={onSubmit}>
            <header>
              <h1>{form.publicTitle}</h1>
              {form.publicDescription ? <p>{form.publicDescription}</p> : null}
            </header>
            <div className="sr-only" aria-hidden="true">
              <label>
                網站
                <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
              </label>
            </div>
            <EnquiryFormFields
              questions={form.questions}
              answers={answers}
              errors={errors}
              splitLayout
              onChange={patchAnswer}
            />
            <Button type="submit" disabled={submitting}>
              {submitting ? "送出中…" : form.submitLabel || "Submit"}
            </Button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
