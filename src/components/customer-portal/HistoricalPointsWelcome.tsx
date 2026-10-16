import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { acknowledgeHistoricalRewardNotice, fetchHistoricalRewardNotice, type HistoricalRewardNotice } from "@/lib/historical-reward-notice";
import "@/lib/historical-reward-notice-i18n";
import "./historical-points-welcome.css";

export function HistoricalPointsWelcome() {
  const navigate = useNavigate();
  const [notice, setNotice] = useState<HistoricalRewardNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    let active = true;
    void fetchHistoricalRewardNotice().then(value => { if (active) setNotice(value); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  async function dismiss(viewPoints = false) {
    if (!notice || submitting.current) return;
    submitting.current = true; setBusy(true); setError(false);
    try {
      await acknowledgeHistoricalRewardNotice(notice);
      setNotice(null);
      if (viewPoints) navigate("/customer/personal/points");
    } catch { setError(true); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <HistoricalPointsWelcomeDialog notice={notice} busy={busy} error={error}
    onDismiss={() => void dismiss()} onView={() => void dismiss(true)} />;
}

export function HistoricalPointsWelcomeDialog({ notice, busy = false, error = false, onDismiss, onView }: {
  notice: HistoricalRewardNotice | null; busy?: boolean; error?: boolean; onDismiss: () => void; onView: () => void;
}) {
  const { t, i18n } = useTranslation();
  const expiry = notice ? new Intl.DateTimeFormat(i18n.language, {
    year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Hong_Kong",
  }).format(new Date(notice.expiresAt)) : "";
  return <Modal open={Boolean(notice)} title={t("historicalReward.title")}
    description={t("historicalReward.description")} closeLabel={t("historicalReward.close")}
    onClose={onDismiss} showClose={false} closeOnBackdrop={false}
    closeOnEscape={!busy} size="sm" className="historical-points-welcome" rootClassName="historical-points-welcome-root"
    footer={<>
      <Button variant="outline" disabled={busy} onClick={onDismiss}>{t("historicalReward.later")}</Button>
      <Button disabled={busy} onClick={onView}>{t(busy ? "historicalReward.saving" : "historicalReward.view")}<ArrowRight aria-hidden="true" /></Button>
    </>}>
    <img className="historical-points-art" src="/assets/historical-points-thank-you.png" alt="" />
    <p className="historical-points-amount"><strong>+ {notice?.points.toLocaleString(i18n.language)}</strong><span>{t("historicalReward.points")}</span></p>
    <p className="historical-points-use">{t("historicalReward.use")}</p>
    <p className="historical-points-expiry">{t("historicalReward.expiry", { date: expiry })}</p>
    {error && <p className="historical-points-error" role="alert">{t("historicalReward.error")}</p>}
  </Modal>;
}
