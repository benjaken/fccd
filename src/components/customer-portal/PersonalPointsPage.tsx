import { PersonalPageSkeleton } from "./PersonalPageSkeleton";
import { useEffect, useRef, useState } from "react";
import { FileText, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchPersonalPoints, type PersonalPoints } from "@/lib/customer-personal";
import { redeemPersonalCatalog } from "@/lib/customer-reward-catalog";
import { RewardCatalogList } from "./RewardCatalogList";
import { RewardRedemptionRecords } from "./RewardRedemptionRecords";
import "./personal-points.css";
import "@/lib/personal-rewards-i18n";
import "@/lib/customer-portal-i18n";

export function PersonalPointsPage({ initialPoints = null, onPointsChange }: { initialPoints?: PersonalPoints | null; onPointsChange?: (points: PersonalPoints) => void }) {
  const { t, i18n } = useTranslation();
  const [points, setPoints] = useState<PersonalPoints | null>(initialPoints);
  const [failed, setFailed] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"redeem" | "ledger" | "redemptions">("redeem");
  async function load() {
    setFailed(false);
    try { const next = await fetchPersonalPoints(); setPoints(next); onPointsChange?.(next); }
    catch { setFailed(true); }
  }
  useEffect(() => { if (!initialPoints) void load(); }, []);
  const records = tab === "ledger" ? points?.ledger : undefined;
  const entries = records?.slice(0, visibleCount);
  const recordCount = records?.length ?? 0;
  useEffect(() => {
    const target = loadMoreRef.current;
    if (tab !== "ledger" || !target || visibleCount >= recordCount) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        setVisibleCount(count => Math.min(count + 10, recordCount));
      }
    }, { rootMargin: "0px 0px 160px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [tab, visibleCount, recordCount]);
  if (!points && !failed) return <PersonalPointsSkeleton label={t("personal.loading")} />;
  return <section className="personal-rewards">
    <header className="personal-rewards-intro">
      <div><h1>{t("personal.points")}</h1><p>{t("personal.pointsIntro")}</p></div>
      <img src="/assets/customer-personal/points-gift.png" alt="" />
    </header>
    {failed ? <div className="personal-data-error" role="alert"><p>{t("personal.loadFailed")}</p><Button variant="outline" onClick={() => void load()}>{t("personal.retry")}</Button></div> : null}
    <div className="personal-rewards-balance" aria-busy={!points && !failed}>
      <img className="personal-rewards-wallet" src="/assets/customer-personal/points-wallet.png" alt="" />
      <div className="personal-rewards-total"><h2>{t("personal.balance")}</h2>
        <strong>{points ? `${points.balance.toLocaleString()} ${t("personal.pointUnit")}` : failed ? "—" : t("personal.loading")}</strong>
        <span><Star size={20} fill="currentColor" />{t("personalRewards.keepEarning")}</span>
      </div>
      <img className="personal-rewards-coins" src="/assets/customer-personal/points-balance-art.png" alt="" />
    </div>
    {points && Number(points.incoming) > 0 ? <p>{t("personal.incomingPoints", { count: points.incoming, date: points.incoming_at ? new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Hong_Kong", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(points.incoming_at)) : "" })}</p> : null}
    {points && points.pending > 0 ? <p>{t("personal.pendingPoints", { count: points.pending })}</p> : null}
    <div className="personal-rewards-tabs" role="tablist" aria-label={t("personalRewards.tabs")}>
      {(["redeem", "ledger", "redemptions"] as const).map(key => <button key={key} type="button" role="tab" id={`rewards-tab-${key}`} aria-selected={tab === key} aria-controls={`rewards-panel-${key}`} tabIndex={tab === key ? 0 : -1} onClick={() => { setTab(key); setVisibleCount(10); }} onKeyDown={event => {
        const keys = ["redeem", "ledger", "redemptions"] as const;
        const index = keys.indexOf(key);
        const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : -1;
        if (next < 0) return;
        event.preventDefault(); setTab(keys[next]); setVisibleCount(10);
        document.getElementById(`rewards-tab-${keys[next]}`)?.focus();
      }}>{t(`personalRewards.${key}`)}</button>)}
    </div>
    <div role="tabpanel" id={`rewards-panel-${tab}`} aria-labelledby={`rewards-tab-${tab}`} tabIndex={0}>
    {tab === "redeem" ? <div className="personal-rewards-catalog"><RewardCatalogList balance={points?.balance ?? 0} disabled={!points || failed} onRedeem={async item => {
      await redeemPersonalCatalog(crypto.randomUUID(), item.id);
      await load();
    }} /></div> : null}
    {tab === "ledger" ? <section className="personal-rewards-history">
      <header><h2>{t(`personalRewards.${tab}`)}</h2></header>
      {!points && !failed ? <PersonalPageSkeleton variant="ledger" /> : entries?.length ? <ul>{entries.map(entry => <li key={entry.id}>
        <span className="personal-rewards-record-icon"><FileText size={26} /></span>
        <div><strong>{t(`personal.ledgerKind.${entry.kind}`, { defaultValue: entry.kind })}</strong><time dateTime={entry.created_at}>{new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(entry.created_at))}</time></div>
        <b className={entry.points < 0 ? "is-debit" : ""}>{entry.points > 0 ? "+" : ""}{entry.points.toLocaleString()}</b>
      </li>)}</ul> : !failed ? <EmptyState title={t("personal.noLedger")} /> : null}
      {visibleCount < recordCount ? <div ref={loadMoreRef} className="personal-rewards-load-more" aria-hidden="true" /> : null}
    </section> : null}
    {tab === "redemptions" ? <section className="personal-rewards-history" aria-labelledby="rewards-tab-redemptions">
      <header><h2>{t("personalRewards.redemptions")}</h2></header>
      <RewardRedemptionRecords scope="personal" refreshKey={points?.balance} />
    </section> : null}
    </div>
  </section>;
}

export function PersonalPointsSkeleton({ label }: { label: string }) {
  return <PersonalPageSkeleton variant="points" label={label} />;
}
