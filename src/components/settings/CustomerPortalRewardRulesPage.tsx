import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { SearchField } from "@/components/ui/search-field";
import { CornerNotice } from "@/components/ui/corner-notice";
import { SidePanel } from "@/components/ui/side-panel";
import { createRewardRule, listRewardRules, rewardRuleThreshold,
  type RewardRuleVersion } from "@/lib/customer-portal-reward-rules-ops";
import "@/components/customer-portal.css";
import "./customer-reward-rules.css";
import { CustomerRewardRulesSkeleton } from "./CustomerRewardRulesSkeleton";

type Panel = "version" | "view" | null;
const EXAMPLE_SPEND = 2500;

function errorKey(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (message.includes("page_access_required")) return "accessDenied";
  if (message.includes("duplicate_effective_at")) return "duplicateEffectiveAt";
  if (message.includes("invalid_reward_rule")) return "invalidRewardRule";
  if (message.includes("Could not find the function") || message.includes("schema cache")) return "serviceUnavailable";
  return "operationFailed";
}
function hongKongInput(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = (key: string) => parts.find(part => part.type === key)?.value;
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}
function versionLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const bit = (key: string) => parts.find(part => part.type === key)?.value ?? "";
  return `V${bit("year")}${bit("month")}${bit("day")}-${bit("hour")}${bit("minute")}`;
}
function ruleStatus(rule: RewardRuleVersion) {
  if (rule.is_active) return "active";
  return new Date(rule.effective_at).getTime() > Date.now() ? "scheduled" : "superseded";
}
function earnedPoints(spend: number, rate: number | null) {
  if (rate === null || rate <= 0 || !Number.isFinite(spend) || spend <= 0) return 0;
  return Math.floor(spend / rate);
}

export function CustomerPortalRewardRulesPage() {
  const { t, i18n } = useTranslation();
  const access = useCurrentPageAccess();
  const canEdit = access.canAccess("settings.customer_portal.reward_rules.edit") || Boolean(access.canManage?.("settings.customer_portal.reward_rules"));
  const [rules, setRules] = useState<RewardRuleVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [rate, setRate] = useState("25");
  const [effectiveAt, setEffectiveAt] = useState(() => hongKongInput(new Date()));
  const [versionQuery, setVersionQuery] = useState("");
  const [viewing, setViewing] = useState<RewardRuleVersion | null>(null);
  const [formError, setFormError] = useState("");
  const text = (key: string) => t(`portalRewardRules.${key}`);
  const when = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  };
  const amount = (value: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 4 }).format(value);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const versions = await listRewardRules();
      setRules(versions.map(row => ({ ...row, hkd_per_point: rewardRuleThreshold(row.hkd_per_point) })));
    } catch (reason) {
      setRules([]);
      setError(t(`portalRewardRules.${errorKey(reason)}`));
    } finally {
      setLoading(false);
    }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  const active = rules.find(rule => rule.is_active);
  const invalid = rules.some(rule => rule.hkd_per_point === null);
  const activeRate = active?.hkd_per_point ?? null;
  const examplePoints = earnedPoints(EXAMPLE_SPEND, activeRate);
  const exampleShare = EXAMPLE_SPEND > 0 ? new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format((examplePoints / EXAMPLE_SPEND) * 100) : "0";
  const runningDays = active ? Math.floor((Date.now() - new Date(active.effective_at).getTime()) / 86_400_000) : 0;
  const filtered = useMemo(() => {
    const term = versionQuery.trim().toLowerCase();
    if (!term) return rules;
    return rules.filter(rule => [versionLabel(rule.effective_at), rule.hkd_per_point === null ? "" : amount(rule.hkd_per_point), when(rule.effective_at), when(rule.created_at), text(ruleStatus(rule))].join(" ").toLowerCase().includes(term));
  }, [amount, rules, text, versionQuery, when]);
  function open(next: Panel) {
    setFormError("");
    if (next === "version") { setRate(String(activeRate ?? 25)); setEffectiveAt(hongKongInput(new Date())); }
    setPanel(next);
  }
  function openVersion(rule: RewardRuleVersion) {
    setViewing(rule);
    setFormError("");
    setPanel("view");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !canEdit || panel === "view") return;
    setFormError("");
    setNotice("");
    let action: () => Promise<unknown>;
    let success: string;
    if (panel === "version") {
      const threshold = rewardRuleThreshold(rate);
      const date = new Date(`${effectiveAt}+08:00`);
      if (threshold === null || !effectiveAt || Number.isNaN(date.getTime())) { setFormError(text("invalidRewardRule")); return; }
      action = () => createRewardRule(threshold, date.toISOString());
      success = "saved";
    } else return;
    setBusy(true);
    try {
      await action();
      setPanel(null);
      setNotice(text(success));
      await load();
    } catch (reason) {
      setFormError(text(errorKey(reason)));
    } finally {
      setBusy(false);
    }
  }
  const title = panel === "version" ? "createVersion" : "versionDetail";
  if (loading) return <CustomerRewardRulesSkeleton label={text("loading")} canEdit={canEdit} />;
  return <section className="reward-rules-page">
    {error ? <div className="reward-rules-message" role="alert"><span>{error}</span><Button variant="outline" onClick={() => void load()}>{t("portal.retry")}</Button></div> : null}
    {invalid ? <div className="reward-rules-message" role="alert"><span>{text("dataUpdateRequired")}</span><Button variant="outline" onClick={() => void load()}>{t("portal.retry")}</Button></div> : null}
    {notice ? <CornerNotice message={notice} onDismiss={() => setNotice("")} /> : null}
    <div className="reward-rules-layout">
      <div className="reward-rules-main">
        <section className="reward-rule-current" aria-label={text("currentRule")}>
          <div className="reward-rule-section-heading">
            <h2>{text("currentRule")}</h2>
            <div className="reward-rules-actions">
              {active && activeRate !== null ? <span className="reward-rule-status" data-status="active">{activeRate === 0 ? text("earningPaused") : text("active")}</span> : null}
              {active && activeRate !== null && activeRate > 0 ? <span className="reward-rule-status" data-status="active">{text("healthy")}</span> : null}
              {canEdit ? <Button onClick={() => open("version")} disabled={loading || invalid || Boolean(error)}><Plus size={18} />{text("createVersion")}</Button> : null}
            </div>
          </div>
          {loading ? <p role="status">{text("loading")}</p> : active && activeRate !== null && activeRate > 0 ? <>
            <div className="reward-rule-banner">
              <div>
                <p>{text("formulaLabel")}</p>
                <strong>{t("portalRewardRules.earnStatement", { rate: amount(activeRate) })}</strong>
                <small>{text("effectiveAt")} · {when(active.effective_at)} · {text("hkTime")} · {runningDays >= 0 ? t("portalRewardRules.runningDays", { count: runningDays }) : text("scheduledRule")}</small>
              </div>
              <aside>
                <span>{text("exampleTitle")}</span>
                <b>{t("portalRewardRules.exampleSpend", { amount: amount(EXAMPLE_SPEND) })}</b>
                <strong>{t("portalRewardRules.examplePoints", { points: amount(examplePoints) })}</strong>
                <small>{t("portalRewardRules.exampleShare", { percent: exampleShare })}</small>
              </aside>
            </div>
          </> : <p className="reward-rule-statement">{activeRate === 0 ? text("pausedDescription") : text("ruleUnavailable")}</p>}
          <div className="reward-rule-facts">
            <article><h3>{text("scopeTitle")}</h3><p>{text("scopeBody")}</p></article>
            <article><h3>{text("postingTitle")}</h3><p>{text("postingBody")}</p></article>
            <article><h3>{text("limitTitle")}</h3><p>{text("limitBody")}</p></article>
          </div>
        </section>
        <section className="reward-rule-history" aria-label={text("history")}>
          <div className="reward-rule-section-heading"><h2>{text("history")}</h2><span>{t("portalRewardRules.versionCount", { count: rules.length })}</span></div>
          <div className="reward-rule-history-tools">
            <p>{text("effectiveAtHint")}</p>
            <SearchField id="reward-rule-version-search" value={versionQuery} onChange={setVersionQuery} label={text("searchVersions")} placeholder={text("searchVersionsPlaceholder")} />
          </div>
          <ListTable loading={loading} loadingLabel={text("loading")} skeletonColumns={6} skeletonRows={5} onRefresh={load} header={<tr><th>{text("versionLabel")}</th><th>{text("hkdPerPoint")}</th><th>{text("effectiveAt")}</th><th>{text("createdAt")}</th><th>{text("status")}</th><th>{text("viewVersion")}</th></tr>}>
            {filtered.map(rule => {
              const status = ruleStatus(rule);
              return <tr key={rule.id}>
                <td className="reward-rule-code">{versionLabel(rule.effective_at)}</td>
                <td className="reward-rule-rate">{rule.hkd_per_point === null ? "—" : rule.hkd_per_point === 0 ? text("earningPaused") : amount(rule.hkd_per_point)}</td>
                <td>{when(rule.effective_at)}</td>
                <td>{when(rule.created_at)}</td>
                <td><span className="reward-rule-status" data-status={status}>{text(status)}</span></td>
                <td><Button type="button" variant="ghost" onClick={() => openVersion(rule)}>{text("viewVersion")}</Button></td>
              </tr>;
            })}
            {!filtered.length ? <tr><td colSpan={6}>{error ? text("historyUnavailable") : versionQuery.trim() ? text("noVersionMatches") : text("noRules")}</td></tr> : null}
          </ListTable>
        </section>
      </div>
    </div>
    <SidePanel open={panel !== null} title={text(title)} description={panel === "version" ? text("effectiveAtHint") : undefined} onClose={() => { if (!busy) setPanel(null); }} closeLabel={text("close")} footer={panel === "version" ? <><Button variant="outline" type="button" disabled={busy} onClick={() => setPanel(null)}>{text("close")}</Button><Button type="submit" form="reward-rule-form" disabled={busy}>{busy ? text("saving") : text("save")}</Button></> : undefined}>
      {panel === "view" && viewing ? <dl className="reward-version-detail">
        <div><dt>{text("versionLabel")}</dt><dd>{versionLabel(viewing.effective_at)}</dd></div>
        <div><dt>{text("hkdPerPoint")}</dt><dd>{viewing.hkd_per_point === null ? "—" : viewing.hkd_per_point === 0 ? text("earningPaused") : amount(viewing.hkd_per_point)}</dd></div>
        <div><dt>{text("effectiveAt")}</dt><dd>{when(viewing.effective_at)} · {text("hkTime")}</dd></div>
        <div><dt>{text("createdAt")}</dt><dd>{when(viewing.created_at)}</dd></div>
        <div><dt>{text("status")}</dt><dd>{text(ruleStatus(viewing))}</dd></div>
      </dl> : <form id="reward-rule-form" className="portal-ops-form reward-rule-form" onSubmit={submit}>
        {formError ? <p role="alert" className="reward-rule-form-error">{formError}</p> : null}
        {panel === "version" ? <>
          <label>{text("hkdPerPoint")}<input aria-label={text("hkdPerPoint")} type="number" min={0} max={100000} step="0.0001" value={rate} onChange={event => setRate(event.target.value)} required /><small>{text("hkdPerPointHint")}</small></label>
          <label>{text("effectiveAt")}<input aria-label={text("effectiveAt")} type="datetime-local" value={effectiveAt} onChange={event => setEffectiveAt(event.target.value)} required /><small>{text("hkTime")}</small></label>
        </> : null}
      </form>}
    </SidePanel>
  </section>;
}
