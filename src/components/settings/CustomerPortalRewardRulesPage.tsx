import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, CalendarDays, Plus, RotateCcw } from "lucide-react";
import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { createRewardRule, listPointHolidays, listRewardRules, recordFoodRefund, rewardRuleThreshold, searchRefundOrders, setPointHoliday,
  type PointHoliday, type RefundOrderMatch, type RewardRuleVersion } from "@/lib/customer-portal-reward-rules-ops";
import "@/components/customer-portal.css";
import "./customer-reward-rules.css";

type Panel = "version" | "holiday" | "refund" | null;
function errorKey(error: unknown) {
  const message=error && typeof error==="object" && "message" in error ? String(error.message) : "";
  if (message.includes("page_access_required")) return "accessDenied";
  if (message.includes("duplicate_effective_at")) return "duplicateEffectiveAt";
  if (message.includes("invalid_reward_rule")) return "invalidRewardRule";
  if (message.includes("invalid_food_refund")) return "invalidRefund";
  if (message.includes("Could not find the function") || message.includes("schema cache")) return "serviceUnavailable";
  return "operationFailed";
}
function hongKongInput(date: Date) {
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Hong_Kong",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
  const value=(key:string)=>parts.find(part=>part.type===key)?.value;
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}

export function CustomerPortalRewardRulesPage() {
  const {t,i18n}=useTranslation();
  const access=useCurrentPageAccess();
  const canEdit=access.canAccess("settings.customer_portal.reward_rules.edit") || Boolean(access.canManage?.("settings.customer_portal.reward_rules"));
  const [rules,setRules]=useState<RewardRuleVersion[]>([]);
  const [holidays,setHolidays]=useState<PointHoliday[] | null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [panel,setPanel]=useState<Panel>(null);
  const [rate,setRate]=useState("25");
  const [effectiveAt,setEffectiveAt]=useState(()=>hongKongInput(new Date()));
  const [holidayOn,setHolidayOn]=useState("");
  const [holidayName,setHolidayName]=useState("");
  const [orderQuery,setOrderQuery]=useState("");
  const [orderMatches,setOrderMatches]=useState<RefundOrderMatch[]>([]);
  const [orderSearchState,setOrderSearchState]=useState<"idle"|"loading"|"error">("idle");
  const [selectedOrder,setSelectedOrder]=useState<RefundOrderMatch | null>(null);
  const [refundFood,setRefundFood]=useState("");
  const [formError,setFormError]=useState("");
  const text=(key:string)=>t(`portalRewardRules.${key}`);
  const when=(value:string)=>{
    const date=new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(i18n.language,{timeZone:"Asia/Hong_Kong",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(date);
  };
  const amount=(value:number)=>new Intl.NumberFormat(i18n.language,{maximumFractionDigits:4}).format(value);
  const money=(value:number | null)=>value===null || Number.isNaN(Number(value)) ? "—" : new Intl.NumberFormat(i18n.language,{style:"currency",currency:"HKD",currencyDisplay:"narrowSymbol"}).format(Number(value));
  const load=useCallback(async()=>{
    setLoading(true);setError("");
    const [versions,dates]=await Promise.allSettled([listRewardRules(),listPointHolidays()]);
    if (versions.status==="fulfilled") setRules(versions.value.map(row=>({...row,hkd_per_point:rewardRuleThreshold(row.hkd_per_point)})));
    else {setRules([]);setError(t(`portalRewardRules.${errorKey(versions.reason)}`));}
    setHolidays(dates.status==="fulfilled" ? dates.value : null);
    setLoading(false);
  },[t]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    if (panel!=="refund") return;
    const term=orderQuery.trim();
    if (term.length<2) {setOrderMatches([]);setOrderSearchState("idle");return;}
    let cancelled=false;
    const timer=window.setTimeout(()=>{
      setOrderSearchState("loading");
      searchRefundOrders(term).then(rows=>{if(!cancelled){setOrderMatches(rows);setOrderSearchState("idle");}}).catch(()=>{if(!cancelled){setOrderMatches([]);setOrderSearchState("error");}});
    },250);
    return ()=>{cancelled=true;window.clearTimeout(timer);};
  },[orderQuery,panel]);
  const active=rules.find(rule=>rule.is_active);
  const invalid=rules.some(rule=>rule.hkd_per_point===null);
  function open(next:Panel) {
    setFormError("");
    if (next==="version") {setRate(String(active?.hkd_per_point ?? 25));setEffectiveAt(hongKongInput(new Date()));}
    if (next==="refund") {setOrderQuery("");setOrderMatches([]);setOrderSearchState("idle");setSelectedOrder(null);setRefundFood("");}
    setPanel(next);
  }
  async function submit(event:FormEvent) {
    event.preventDefault();if (busy || !canEdit) return;
    setFormError("");setNotice("");
    let action:()=>Promise<unknown>;let success:string;
    if (panel==="version") {
      const threshold=rewardRuleThreshold(rate);const date=new Date(`${effectiveAt}+08:00`);
      if (threshold===null || !effectiveAt || Number.isNaN(date.getTime())) {setFormError(text("invalidRewardRule"));return;}
      action=()=>createRewardRule(threshold,date.toISOString());success="saved";
    } else if (panel==="holiday") {
      if (!holidayOn) {setFormError(text("invalidHoliday"));return;}
      action=()=>setPointHoliday(holidayOn,holidayName.trim());success="holidaySaved";
    } else if (panel==="refund") {
      const food=Number(refundFood);
      if (!selectedOrder || !Number.isFinite(food) || food<=0 || Math.abs(food*100-Math.round(food*100))>0.000001) {setFormError(text("invalidRefund"));return;}
      action=()=>recordFoodRefund(selectedOrder.id,food);success="refundSaved";
    } else return;
    setBusy(true);
    try {await action();setPanel(null);setHolidayOn("");setHolidayName("");setRefundFood("");setOrderQuery("");setSelectedOrder(null);setNotice(text(success));await load();}
    catch(reason) {setFormError(text(errorKey(reason)));}
    finally {setBusy(false);}
  }
  const title=panel==="version" ? "createVersion" : panel==="holiday" ? "saveHoliday" : "refundTitle";
  return <section className="reward-rules-page">
    <header className="reward-rules-heading"><div><h1>{t("navigation.customerPortalRewardRules")}</h1><p>{text("pageIntro")}</p></div>
      {canEdit ? <Button onClick={()=>open("version")} disabled={loading || invalid || Boolean(error)}><Plus size={18}/>{text("createVersion")}</Button> : null}
    </header>
    {error ? <div className="reward-rules-message" role="alert"><span>{error}</span><Button variant="outline" onClick={()=>void load()}>{t("portal.retry")}</Button></div> : null}
    {invalid ? <div className="reward-rules-message" role="alert"><span>{text("dataUpdateRequired")}</span><Button variant="outline" onClick={()=>void load()}>{t("portal.retry")}</Button></div> : null}
    {notice ? <p className="reward-rules-notice" role="status">{notice}</p> : null}
    <div className="reward-rules-layout"><div className="reward-rules-main">
      <section className="reward-rule-current" aria-label={text("currentRule")}>
        <div className="reward-rule-section-heading"><h2>{text("currentRule")}</h2>{active && active.hkd_per_point!==null ? <span className="reward-rule-status" data-status="active">{active.hkd_per_point===0 ? text("earningPaused") : text("active")}</span> : null}</div>
        {loading ? <p role="status">{text("loading")}</p> : <><p className="reward-rule-statement">{active?.hkd_per_point===0 ? text("pausedDescription") : active && active.hkd_per_point!==null ? t("portalRewardRules.earnStatement",{rate:amount(active.hkd_per_point)}) : text("ruleUnavailable")}</p>{active ? <p className="reward-rule-effective">{text("effectiveAt")} · {when(active.effective_at)} · {text("hkTime")}</p> : null}</>}
        <div className="reward-rule-policy"><span>{text("foodOnly")}</span><span>{text("businessDay")}</span><span>{text("noCashOffset")}</span></div>
      </section>
      <section className="reward-rule-history" aria-label={text("history")}>
        <div className="reward-rule-section-heading"><h2>{text("history")}</h2><span>{t("portalRewardRules.versionCount",{count:rules.length})}</span></div>
        <p className="reward-rule-history-hint">{text("effectiveAtHint")}</p>
        <ListTable loading={loading} loadingLabel={text("loading")} skeletonColumns={4} skeletonRows={5} onRefresh={load} header={<tr><th>{text("hkdPerPoint")}</th><th>{text("effectiveAt")}</th><th>{text("createdAt")}</th><th>{text("status")}</th></tr>}>
          {rules.map(rule=>{const status=rule.is_active ? "active" : new Date(rule.effective_at).getTime()>Date.now() ? "scheduled" : "superseded";
            return <tr key={rule.id}><td className="reward-rule-rate">{rule.hkd_per_point===null ? "—" : rule.hkd_per_point===0 ? text("earningPaused") : amount(rule.hkd_per_point)}</td><td>{when(rule.effective_at)}</td><td>{when(rule.created_at)}</td><td><span className="reward-rule-status" data-status={status}>{text(status)}</span></td></tr>;
          })}
          {!rules.length ? <tr><td colSpan={4}>{error ? text("historyUnavailable") : text("noRules")}</td></tr> : null}
        </ListTable>
      </section>
    </div><aside className="reward-rules-aside">
      <section className="reward-rule-holidays"><div className="reward-rule-section-heading"><h2><CalendarDays size={18}/>{text("holidays")}</h2>{canEdit ? <Button size="icon" variant="ghost" aria-label={text("saveHoliday")} title={text("saveHoliday")} disabled={loading || holidays===null} onClick={()=>open("holiday")}><Plus size={18}/></Button> : null}</div>
        <p>{text("holidaysHint")}</p>
        {loading ? <p role="status">{text("loading")}</p> : holidays===null ? <div className="reward-rule-unavailable"><p>{text("holidaysUnavailable")}</p><Button variant="outline" onClick={()=>void load()}>{t("portal.retry")}</Button></div> : holidays.length ? <ul>{holidays.map(day=><li key={day.holiday_on}><time dateTime={day.holiday_on}>{day.holiday_on}</time><span>{day.name || text("unnamedHoliday")}</span></li>)}</ul> : <p className="reward-rule-empty">{text("noHolidays")}</p>}
      </section>
      <section className="reward-rule-refund"><h2><RotateCcw size={18}/>{text("refundTitle")}</h2><p>{text("refundSummary")}</p>{canEdit ? <Button variant="outline" onClick={()=>open("refund")}>{text("recordRefund")}<ArrowRight size={16}/></Button> : null}</section>
    </aside></div>
    <SidePanel open={panel!==null} className={panel==="refund" ? "reward-refund-panel" : undefined} title={text(title)} description={panel==="version" ? text("effectiveAtHint") : panel==="holiday" ? text("holidaysHint") : text("refundSummary")} onClose={()=>{if(!busy)setPanel(null);}} closeLabel={text("close")}>
      <form className="portal-ops-form reward-rule-form" onSubmit={submit}>
        {formError ? <p role="alert" className="reward-rule-form-error">{formError}</p> : null}
        {panel==="version" ? <><label>{text("hkdPerPoint")}<input aria-label={text("hkdPerPoint")} type="number" min={0} max={100000} step="0.0001" value={rate} onChange={e=>setRate(e.target.value)} required/><small>{text("hkdPerPointHint")}</small></label><label>{text("effectiveAt")}<input aria-label={text("effectiveAt")} type="datetime-local" value={effectiveAt} onChange={e=>setEffectiveAt(e.target.value)} required/><small>{text("hkTime")}</small></label></> : panel==="holiday" ? <><label>{text("holidayDate")}<input type="date" value={holidayOn} onChange={e=>setHolidayOn(e.target.value)} required/></label><label>{text("holidayName")}<input value={holidayName} maxLength={120} onChange={e=>setHolidayName(e.target.value)} placeholder={text("holidayNamePlaceholder")}/></label></> : panel==="refund" ? <><label>{text("refundOrder")}<input aria-label={text("refundOrder")} value={orderQuery} onChange={e=>setOrderQuery(e.target.value)} placeholder={text("refundOrderPlaceholder")} autoComplete="off"/><small>{text("selectOrderHint")}</small></label>{orderSearchState==="loading" ? <p role="status">{text("searchingOrders")}</p> : null}{orderSearchState==="error" ? <p role="alert">{text("orderSearchFailed")}</p> : null}{orderMatches.length ? <ul className="reward-order-results" role="listbox" aria-label={text("refundOrder")}>{orderMatches.map(order=><li key={order.id}><button type="button" role="option" aria-selected={selectedOrder?.id===order.id} onClick={()=>setSelectedOrder(order)}><strong>{order.order_number || "—"}</strong><span>{[order.customer_name,order.company_name].filter(Boolean).join(" · ") || "—"}</span></button></li>)}</ul> : orderQuery.trim().length>=2 && orderSearchState==="idle" ? <p className="reward-order-empty">{text("noOrderMatches")}</p> : null}{selectedOrder ? <section className="reward-order-detail" aria-live="polite"><h3>{selectedOrder.order_number || "—"}</h3><dl><div><dt>{text("orderCustomer")}</dt><dd>{selectedOrder.customer_name || "—"}</dd></div>{selectedOrder.company_name ? <div><dt>{text("orderCompany")}</dt><dd>{selectedOrder.company_name}</dd></div> : null}<div><dt>{text("orderPhone")}</dt><dd>{selectedOrder.phone || "—"}</dd></div><div><dt>{text("orderDelivery")}</dt><dd>{selectedOrder.delivery_at ? when(selectedOrder.delivery_at) : "—"}</dd></div><div><dt>{text("orderStatus")}</dt><dd>{selectedOrder.delivery_status || "—"}</dd></div><div><dt>{text("orderFood")}</dt><dd>{money(selectedOrder.food_amount)}</dd></div><div><dt>{text("orderTotal")}</dt><dd>{money(selectedOrder.grand_total)}</dd></div><div><dt>{text("orderOutstanding")}</dt><dd>{money(selectedOrder.outstanding)}</dd></div></dl></section> : null}<label>{text("refundFood")}<input type="number" min="0.01" step="0.01" value={refundFood} onChange={e=>setRefundFood(e.target.value)} placeholder={text("refundFoodPlaceholder")} required/></label></> : null}
        <div className="reward-rule-form-actions"><Button type="submit" disabled={busy}>{busy ? text("saving") : text(panel==="version" ? "save" : panel==="holiday" ? "saveHoliday" : "recordRefund")}</Button><Button variant="outline" type="button" disabled={busy} onClick={()=>setPanel(null)}>{text("close")}</Button></div>
      </form>
    </SidePanel>
  </section>;
}
