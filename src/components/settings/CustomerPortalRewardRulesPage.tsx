import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import "@/components/customer-portal.css";
import {
  createRewardRule,
  listRewardRules,
  type RewardRuleVersion,
} from "@/lib/customer-portal-reward-rules-ops";

function errorText(error: unknown) {
  if (!error || typeof error !== "object") return "operationFailed";
  const message = "message" in error ? String((error as { message?: string }).message ?? "") : "";
  if (message.includes("page_access_required")) return "accessDenied";
  if (message.includes("duplicate_effective_at")) return "duplicateEffectiveAt";
  if (message.includes("invalid_reward_rule")) return "invalidRewardRule";
  return "operationFailed";
}

function toLocalInput(value: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function fromLocalInput(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function formatWhen(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function CustomerPortalRewardRulesPage() {
  const { t } = useTranslation();
  const access = useCurrentPageAccess();
  const canEdit = access.canAccess("settings.customer_portal.reward_rules.edit");
  const [rules, setRules] = useState<RewardRuleVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hkdPerPoint, setHkdPerPoint] = useState("25");
  const [effectiveAt, setEffectiveAt] = useState(() => toLocalInput(new Date()));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRules(await listRewardRules());
    } catch (err) {
      setError(t(`portalRewardRules.${errorText(err)}`));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<void>, successKey: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(t(`portalRewardRules.${successKey}`));
      await load();
    } catch (err) {
      setError(t(`portalRewardRules.${errorText(err)}`));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const rate = Number(hkdPerPoint);
    const iso = fromLocalInput(effectiveAt);
    if (!iso || !Number.isFinite(rate) || rate < 0 || rate > 100000) {
      setError(t("portalRewardRules.invalidRewardRule"));
      return;
    }
    await run(async () => {
      await createRewardRule(rate, iso);
      setPanelOpen(false);
    }, "saved");
  }

  const active = rules.find(rule => rule.is_active) ?? null;

  return (
    <section className="ingredients-page customer-portal-ops">
      <header className="page-heading ingredients-heading">
        <div>
          <h1>{t("navigation.customerPortalRewardRules")}</h1>
          <p>{t("portalRewardRules.description")}</p>
        </div>
        {canEdit ? (
          <Button
            onClick={() => {
              setHkdPerPoint(active ? String(active.hkd_per_point) : "25");
              setEffectiveAt(toLocalInput(new Date()));
              setPanelOpen(true);
            }}
          >
            <Plus /> {t("portalRewardRules.createVersion")}
          </Button>
        ) : null}
      </header>

      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}

      {active ? (
        <p role="status">
          {t("portalRewardRules.currentActive", {
            rate: Number(active.hkd_per_point),
            at: formatWhen(active.effective_at),
          })}
        </p>
      ) : null}
        <ListTable
          className="panel"
          loading={loading}
          loadingLabel={t("portalRewardRules.loading")}
          skeletonColumns={4}
          onRefresh={load}
          header={<tr>
              <th>{t("portalRewardRules.hkdPerPoint")}</th>
              <th>{t("portalRewardRules.effectiveAt")}</th>
              <th>{t("portalRewardRules.createdAt")}</th>
              <th>{t("portalRewardRules.status")}</th>
            </tr>}
        >
            {!rules.length ? <tr><td colSpan={4}>{error ? <Button variant="outline" onClick={() => void load()}>{t("portal.retry")}</Button> : t("portalRewardRules.noRules")}</td></tr> : null}
            {rules.map(rule => (
              <tr key={rule.id}>
                <td>{Number(rule.hkd_per_point)}</td>
                <td>{formatWhen(rule.effective_at)}</td>
                <td>{formatWhen(rule.created_at)}</td>
                <td>
                  {rule.is_active
                    ? t("portalRewardRules.active")
                    : new Date(rule.effective_at).getTime() > Date.now()
                      ? t("portalRewardRules.scheduled")
                      : t("portalRewardRules.superseded")}
                </td>
              </tr>
            ))}
        </ListTable>

      <SidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={t("portalRewardRules.createVersion")}
        closeLabel={t("portalRewardRules.close")}
      >
        <form className="portal-ops-form" onSubmit={submit}>
          <label>
            {t("portalRewardRules.hkdPerPoint")}
            <input
              type="number"
              min={0}
              max={100000}
              step="0.0001"
              value={hkdPerPoint}
              onChange={event => setHkdPerPoint(event.target.value)}
              required
            />
            <small>{t("portalRewardRules.hkdPerPointHint")}</small>
          </label>
          <label>
            {t("portalRewardRules.effectiveAt")}
            <input
              type="datetime-local"
              value={effectiveAt}
              onChange={event => setEffectiveAt(event.target.value)}
              required
            />
            <small>{t("portalRewardRules.effectiveAtHint")}</small>
          </label>
          <div className="portal-ops-actions">
            <Button type="submit" disabled={busy}>
              {t("portalRewardRules.save")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setPanelOpen(false)}>
              {t("portalRewardRules.close")}
            </Button>
          </div>
        </form>
      </SidePanel>
    </section>
  );
}
