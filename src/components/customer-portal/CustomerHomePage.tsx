import { useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Coins } from "lucide-react";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";
const money = (cents: number) => new Intl.NumberFormat("zh-HK", { style: "currency", currency: "HKD" }).format(cents / 100);

export function CustomerHomePage() {
  const portal = useOutletContext<CustomerPortalController>();
  const {t, points, chooseMenu, setPage} = portal;
  const data = portal.data;
  if (!data) return null;
  return <><section className="portal-hero"><span>{data.organization.name}</span><h1>{t("portal.headline")}</h1><p>{t("portal.homeDescription")}</p><Button onClick={()=>setPage("menus")}>{t("portal.orderNow")}</Button></section>
          <section className="portal-points-summary"><Coins/><div><h2>{t("portal.points")}</h2><strong>{data.balance.toLocaleString()} {t("portal.pointUnit")}</strong><p>{t("portal.redeemValue",{value:money(Math.floor(Math.max(0,data.balance)/10))})}</p></div><Button variant="outline" onClick={()=>setPage("points")}>{t("portal.details")}</Button></section>
          <section><h2>{t("portal.menus")}</h2>{data.menus.slice(0,3).map(m=><div className="portal-row" key={m.id}><div><strong>{m.brand} · {m.name}</strong><p>{m.delivery_date} · {m.delivery_time}</p></div><Button variant="outline" onClick={()=>chooseMenu(m)}>{t("portal.choose")}</Button></div>)}{!data.menus.length&&<p>{t("portal.noMenus")}</p>}</section></>;
}
