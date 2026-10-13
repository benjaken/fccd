import { useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Coins } from "lucide-react";
import type { CustomerPortalController } from "@/components/CustomerPortalPage";
export function CustomerHomePage() {
  const portal = useOutletContext<CustomerPortalController>();
  const {t, chooseMenu, applyTemplate, setPage} = portal;
  const data = portal.data;
  if (!data) return null;
  const templates = data.templates ?? [];
  return <><section className="portal-hero"><span>{data.organization.name}</span><h1>{t("portal.headline")}</h1><p>{t("portal.homeDescription")}</p><Button onClick={()=>setPage("menus")}>{t("portal.orderNow")}</Button></section>
          <section className="portal-points-summary"><Coins/><div><h2>{t("portal.points")}</h2><strong>{data.balance.toLocaleString()} {t("portal.pointUnit")}</strong><p>{t("portal.pointsHint")}</p></div><Button variant="outline" onClick={()=>setPage("points")}>{t("portal.details")}</Button></section>
          <section><h2>{t("portal.menus")}</h2>{data.menus.slice(0,3).map(m=><div className="portal-row" key={m.id}><div><strong>{m.brand} · {m.name}</strong><p>{m.delivery_date} · {m.delivery_time}</p></div><Button variant="outline" onClick={()=>chooseMenu(m)}>{t("portal.choose")}</Button></div>)}{!data.menus.length&&<p>{t("portal.noMenus")}</p>}</section>
          <section><h2>{t("portal.templates")}</h2>{templates.slice(0,3).map(template=><div className="portal-row" key={template.id}><div><strong>{template.name}</strong><p>{template.items.map(item=>`${item.name} × ${item.quantity}`).join("、")}</p></div><Button variant="outline" disabled={!data.menus.length} onClick={()=>applyTemplate(template)}>{t("portal.applyTemplate")}</Button></div>)}{!templates.length&&<p>{t("portal.noTemplates")}</p>}<Button variant="outline" onClick={()=>setPage("menus")}>{t("portal.manageTemplates")}</Button></section></>;
}
