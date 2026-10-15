import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";
import { RewardRedemptionRecords } from "@/components/customer-portal/RewardRedemptionRecords";
import { RewardCatalogList } from "@/components/customer-portal/RewardCatalogList";
import { redeemOrganizationCatalog } from "@/lib/customer-reward-catalog";
import { portalPermissions } from "@/lib/customer-portal";

export function CustomerPointsPage() {
  const portal = useOutletContext<CustomerPortalController>();
  const { t } = portal;
  const data = portal.data;
  const [tab, setTab] = useState<"redeem" | "ledger" | "redemptions">("redeem");
  if (!data) return null;
  const tabs = ["redeem", "ledger", "redemptions"] as const;
  return <section className="personal-rewards">
    <header className="personal-rewards-intro">
      <div><h1>{t("portal.points")}</h1></div>
      <img src="/assets/customer-personal/points-gift.png" alt="" />
    </header>
    <div className="personal-rewards-balance">
      <img className="personal-rewards-wallet" src="/assets/customer-personal/points-wallet.png" alt="" />
      <div className="personal-rewards-total"><h2>{t("portal.balanceLabel")}</h2>
        <strong>{data.balance.toLocaleString()} {t("portal.pointUnit")}</strong>
      </div>
      <img className="personal-rewards-coins" src="/assets/customer-personal/points-balance-art.png" alt="" />
    </div>
    <div className="personal-rewards-tabs" role="tablist" aria-label={t("personalRewards.tabs")}>
      {tabs.map(key => <button key={key} type="button" role="tab" id={`org-rewards-tab-${key}`} aria-selected={tab === key} aria-controls={`org-rewards-panel-${key}`} tabIndex={tab === key ? 0 : -1}
        onClick={() => setTab(key)}
        onKeyDown={event => {
          const index = tabs.indexOf(key);
          const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault(); setTab(tabs[next]);
          document.getElementById(`org-rewards-tab-${tabs[next]}`)?.focus();
        }}>{t(`personalRewards.${key}`)}</button>)}
    </div>
    <div role="tabpanel" id={`org-rewards-panel-${tab}`} aria-labelledby={`org-rewards-tab-${tab}`} tabIndex={0}>
      {tab === "redeem" ? (portalPermissions(data).redeem ? <div className="personal-rewards-catalog">
        <RewardCatalogList balance={Number(data.balance)} onRedeem={async item => { await redeemOrganizationCatalog(crypto.randomUUID(), item.id, data.organization.id); await portal.refresh(); }} />
      </div> : null) : null}
      {tab === "ledger" ? <section className="personal-rewards-history">
        <header><h2>{t("personalRewards.ledger")}</h2></header>
        {data.ledger.length ? <ul>{data.ledger.map(entry => <li key={entry.id}>
          <span className="personal-rewards-record-icon"><FileText size={26} /></span>
          <div><strong>{t("portal.ledger." + entry.kind)}</strong><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleDateString("zh-HK", { timeZone: "Asia/Hong_Kong" })}</time></div>
          <b className={entry.points < 0 ? "is-debit" : ""}>{entry.points > 0 ? "+" : ""}{entry.points}</b>
        </li>)}</ul> : <EmptyState title={t("portal.noLedger")} />}
      </section> : null}
      {tab === "redemptions" ? <section className="personal-rewards-history" aria-labelledby="org-rewards-tab-redemptions">
        <header><h2>{t("personalRewards.redemptions")}</h2></header>
        <RewardRedemptionRecords scope="organization" organizationId={data.organization.id} refreshKey={Number(data.balance)} />
      </section> : null}
    </div>
  </section>;
}
