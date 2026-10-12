import { useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";

export function CustomerPointsPage() {
  const portal = useOutletContext<CustomerPortalController>();
  const {t, points} = portal;
  const data = portal.data;
  if (!data) return null;
  return <section><h1>{t("portal.points")}</h1><strong>{data.balance.toLocaleString()} {t("portal.pointUnit")}</strong><p>{t("portal.rewardRules")}</p>{data.ledger.map(e=><div className="portal-row" key={e.id}><div><strong>{t("portal.ledger."+e.kind)}</strong><p>{new Date(e.created_at).toLocaleDateString("zh-HK",{timeZone:"Asia/Hong_Kong"})}{e.expires_at&&" · "+t("portal.expires")+" "+new Date(e.expires_at).toLocaleDateString("zh-HK",{timeZone:"Asia/Hong_Kong"})}</p></div><strong>{e.points>0?"+":""}{e.points}</strong></div>)}{!data.ledger.length&&<p>{t("portal.noLedger")}</p>}</section>;
}
