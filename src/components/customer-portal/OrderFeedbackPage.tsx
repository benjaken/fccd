import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { fetchAccountOrderFeedback, openOrderFeedback, submitAccountOrderFeedback, submitOrderFeedback, type OrderFeedback } from "@/lib/customer-order-feedback";
import "@/lib/customer-portal-i18n";

function messageKey(error: unknown) {
  const text = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "";
  if (text.includes("feedback_already_submitted")) return "portalFeedback.alreadySubmitted";
  if (text.includes("feedback_required")) return "portalFeedback.required";
  return "portalFeedback.unavailable";
}

export function OrderFeedbackCard({ view, onSubmit }: { view: OrderFeedback; onSubmit: (comment: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const when = view.delivery_at ? new Intl.DateTimeFormat("zh-HK", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "numeric", day: "numeric" }).format(new Date(view.delivery_at)) : "";
  return <section>
    <h1>{t("portalFeedback.title")}</h1>
    <p>{t("portalFeedback.intro")}</p>
    <p>{view.order_number}{when ? ` · ${when}` : ""}</p>
    {view.submitted ? <p>{view.comment}</p> : <form onSubmit={event => {
      event.preventDefault();
      setBusy(true); setError("");
      void onSubmit(comment).catch(reason => setError(t(messageKey(reason)))).finally(() => setBusy(false));
    }}>
      <label htmlFor="order-feedback">{t("portalFeedback.comment")}</label>
      <textarea id="order-feedback" value={comment} maxLength={2000} onChange={event => setComment(event.target.value)} />
      {error ? <p role="alert">{error}</p> : null}
      <Button type="submit" disabled={busy || !comment.trim()}>{busy ? t("portalFeedback.submitting") : t("portalFeedback.submit")}</Button>
    </form>}
  </section>;
}

export function OrderFeedbackPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const [view, setView] = useState<OrderFeedback | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void openOrderFeedback(token).then(next => { if (active) setView(next); }).catch(() => { if (active) setError(t("portalFeedback.unavailable")); });
    return () => { active = false; };
  }, [token, t]);
  return <main className="customer-portal">{error ? <section><h1>{t("portalFeedback.title")}</h1><p role="alert">{error}</p></section> : view ? <OrderFeedbackCard view={view} onSubmit={async comment => setView(await submitOrderFeedback(token, comment))} /> : <p role="status">{t("portalFeedback.loading")}</p>}</main>;
}

export function AccountOrderFeedback({ orderId, showEmptyState = false }: { orderId: string; showEmptyState?: boolean }) {
  const { t } = useTranslation();
  const [view, setView] = useState<OrderFeedback | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setView(undefined);
    setError("");
    void fetchAccountOrderFeedback(orderId).then(next => { if (active) setView(next); }).catch(() => { if (active) setError(t("portalFeedback.unavailable")); });
    return () => { active = false; };
  }, [orderId, t, attempt]);
  if (error) return <section><h1>{t("portalFeedback.title")}</h1><p role="alert">{error}</p><Button variant="outline" onClick={() => setAttempt(value => value + 1)}>{t("portalFeedback.retry")}</Button></section>;
  if (view === undefined) return <p role="status">{t("portalFeedback.loading")}</p>;
  if (!view) return showEmptyState ? <section className="personal-empty" role="status"><h1>{t("portalFeedback.emptyTitle")}</h1><p>{t("portalFeedback.emptyDescription")}</p></section> : null;
  return <OrderFeedbackCard view={view} onSubmit={async comment => setView(await submitAccountOrderFeedback(orderId, comment))} />;
}
