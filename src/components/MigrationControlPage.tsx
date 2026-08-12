import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Database,
  FastForward,
  LockKeyhole,
  Play,
  RefreshCw,
  Server,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  allReadinessGatesComplete,
  MIGRATION_STATUS,
  reconciliationGatesComplete,
  totalImported,
} from "@/data/migration-status";
import { cn } from "@/lib/utils";

type MigrationControlPageProps = {
  isSuperAdmin: boolean;
};

export function MigrationControlPage({
  isSuperAdmin,
}: MigrationControlPageProps) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language);
  const handlersReady = MIGRATION_STATUS.gates.durableBackendHandlersComplete;
  const fullReady = allReadinessGatesComplete && handlersReady;
  const switchReady =
    allReadinessGatesComplete && reconciliationGatesComplete && handlersReady;

  const actions = [
    {
      key: "full",
      icon: Play,
      enabled: isSuperAdmin && fullReady,
      gateReason: !allReadinessGatesComplete
        ? "readinessIncomplete"
        : "handlersIncomplete",
    },
    {
      key: "incremental",
      icon: RefreshCw,
      enabled: isSuperAdmin && handlersReady,
      gateReason: "handlersIncomplete",
    },
    {
      key: "resume",
      icon: FastForward,
      enabled: isSuperAdmin && handlersReady,
      gateReason: "handlersIncomplete",
    },
    {
      key: "switch",
      icon: Database,
      enabled: isSuperAdmin && switchReady,
      gateReason:
        !allReadinessGatesComplete || !reconciliationGatesComplete
          ? "switchGatesIncomplete"
          : "handlersIncomplete",
    },
  ] as const;

  return (
    <div className="migration-page migration-control-page">
      <section className="migration-warning">
        <LockKeyhole />
        <div>
          <strong>{t("migrationControl.securityTitle")}</strong>
          <p>{t("migrationControl.securityDescription")}</p>
        </div>
        <span>
          {isSuperAdmin
            ? t("migrationControl.superAdmin")
            : t("migrationControl.locked")}
        </span>
      </section>

      <section className="migration-hero">
        <div>
          <span className="eyebrow">{t("migrationControl.eyebrow")}</span>
          <h1>{t("migrationControl.title")}</h1>
          <p>{t("migrationControl.description")}</p>
        </div>
        <span className="migration-source-chip">
          <Server />
          {MIGRATION_STATUS.source.system}
        </span>
      </section>

      <section className="control-overview-grid">
        <article className="panel control-policy-card">
          <CalendarClock />
          <div>
            <span>{t("migrationControl.cutoff")}</span>
            <strong>{MIGRATION_STATUS.policy.historicalCutoffLocal}</strong>
            <small>{t("migrationControl.cutoffUtc", { value: MIGRATION_STATUS.policy.historicalCutoffUtc })}</small>
          </div>
        </article>
        <article className="panel control-policy-card">
          <CheckCircle2 />
          <div>
            <span>{t("migrationControl.historicalPolicy")}</span>
            <strong>{t("migrationControl.importOnce")}</strong>
            <small>{t("migrationControl.noRepeat")}</small>
          </div>
        </article>
        <article className="panel control-policy-card">
          <RefreshCw />
          <div>
            <span>{t("migrationControl.activePolicy")}</span>
            <strong>{t("migrationControl.modifiedCheckpoint")}</strong>
            <small>
              <code>{MIGRATION_STATUS.policy.activeIncrementalFilter}</code>
            </small>
          </div>
        </article>
        <article className="panel control-policy-card">
          <Database />
          <div>
            <span>{t("migrationControl.latestSnapshot")}</span>
            <strong>{MIGRATION_STATUS.snapshotAt}</strong>
            <small>
              {t("migrationControl.importedTotal", {
                count: number.format(totalImported),
              })}
            </small>
          </div>
        </article>
      </section>

      <section className="panel control-section">
        <header>
          <div>
            <h2>{t("migrationControl.phaseTitle")}</h2>
            <p>{t("migrationControl.phaseDescription")}</p>
          </div>
        </header>
        <div className="phase-grid">
          {MIGRATION_STATUS.phases.map((phase) => (
            <article key={phase.key}>
              <div>
                <strong>{t(`migrationControl.phases.${phase.key}`)}</strong>
                <span
                  className={cn(
                    "control-status",
                    phase.status === "complete" ? "ready" : "partial",
                  )}
                >
                  {t(`migrationControl.phaseStatuses.${phase.status}`)}
                </span>
              </div>
              <b>{number.format(phase.imported)}</b>
              <small>
                {t("migrationControl.unresolvedFk", {
                  count: phase.unresolvedUuidForeignKeys,
                })}
              </small>
            </article>
          ))}
        </div>
      </section>

      <div className="control-two-column">
        <section className="panel control-section">
          <header>
            <div>
              <h2>{t("migrationControl.readinessTitle")}</h2>
              <p>{t("migrationControl.readinessDescription")}</p>
            </div>
          </header>
          <div className="readiness-list">
            {MIGRATION_STATUS.readiness.map((domain) => (
              <div key={domain.key}>
                <span>{t(`migrationControl.domains.${domain.key}`)}</span>
                <strong className={cn("control-status", domain.status)}>
                  {t(`migrationControl.readiness.${domain.status}`)}
                </strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel control-section">
          <header>
            <div>
              <h2>{t("migrationControl.blockersTitle")}</h2>
              <p>{t("migrationControl.blockersDescription")}</p>
            </div>
          </header>
          <ul className="blocker-list">
            {MIGRATION_STATUS.blockers.map((blocker) => (
              <li key={blocker}>
                <AlertTriangle />
                {t(`migrationControl.blockers.${blocker}`)}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel control-section migration-actions-section">
        <header>
          <div>
            <h2>{t("migrationControl.actionsTitle")}</h2>
            <p>{t("migrationControl.actionsDescription")}</p>
          </div>
        </header>
        <div className="migration-action-grid">
          {actions.map(({ key, icon: ActionIcon, enabled, gateReason }) => {
            const reason = !isSuperAdmin ? "superAdminRequired" : gateReason;
            return (
              <article key={key}>
                <Button disabled={!enabled} aria-describedby={`${key}-reason`}>
                  <ActionIcon />
                  {t(`migrationControl.actions.${key}`)}
                </Button>
                <p id={`${key}-reason`}>
                  <LockKeyhole />
                  {t(`migrationControl.reasons.${reason}`)}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="control-source-note">
        <Server />
        <div>
          <strong>{t("migrationControl.currentSource")}</strong>
          <code>{MIGRATION_STATUS.source.baseUrl}</code>
          <span>
            {t("migrationControl.target", {
              target: MIGRATION_STATUS.source.target,
            })}
          </span>
        </div>
      </section>
    </div>
  );
}
