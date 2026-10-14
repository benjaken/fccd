import { useOutletContext } from "react-router-dom";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";
import { IssuedShopifyVouchers } from "@/components/customer-portal/IssuedShopifyVouchers";
import { RewardCatalogList } from "@/components/customer-portal/RewardCatalogList";
import { redeemOrganizationCatalog } from "@/lib/customer-reward-catalog";

export function CustomerPointsPage() {
  const portal = useOutletContext<CustomerPortalController>();
  const { t } = portal;
  const data = portal.data;
  if (!data) return null;
  return <section>
    <h1>{t("portal.points")}</h1>
    <strong>{data.balance.toLocaleString()} {t("portal.pointUnit")}</strong>
    <p>{t("portal.rewardRules")}</p>
    <RewardCatalogList balance={Number(data.balance)} onRedeem={async item => { await redeemOrganizationCatalog(crypto.randomUUID(), item.id); await portal.refresh(); }} />
    <IssuedShopifyVouchers scope="organization" refreshKey={Number(data.balance)} />
    {data.ledger.map(entry => <div className="portal-row" key={entry.id}><div><strong>{t("portal.ledger." + entry.kind)}</strong><p>{new Date(entry.created_at).toLocaleDateString("zh-HK", { timeZone: "Asia/Hong_Kong" })}{entry.expires_at && " · " + t("portal.expires") + " " + new Date(entry.expires_at).toLocaleDateString("zh-HK", { timeZone: "Asia/Hong_Kong" })}</p></div><strong>{entry.points > 0 ? "+" : ""}{entry.points}</strong></div>)}
    {!data.ledger.length && <p>{t("portal.noLedger")}</p>}
  </section>;
}
