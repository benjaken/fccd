import { AlertTriangle, CheckCircle2, Network } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MIGRATION_STATUS } from "@/data/migration-status";

export function MigratedFkPage() {
  const { t } = useTranslation();
  return (
    <div className="migration-page migrated-fk-page">
      <section className="migration-hero">
        <div>
          <span className="eyebrow">{t("migratedFk.eyebrow")}</span>
          <h1>{t("migratedFk.title")}</h1>
          <p>{t("migratedFk.description")}</p>
        </div>
      </section>
      <section className="fk-summary-metrics">
        <article className="success">
          <span>{t("migratedFk.verifiedReferences")}</span>
          <strong>
            {MIGRATION_STATUS.fk.databaseVerifiedReferenceRows.toLocaleString()}
          </strong>
        </article>
        <article>
          <span>{t("migratedFk.fkColumns")}</span>
          <strong>{MIGRATION_STATUS.fk.databaseVerifiedFkColumns}</strong>
        </article>
        <article className="success">
          <span>{t("migratedFk.unresolved")}</span>
          <strong>{MIGRATION_STATUS.fk.migratedUnresolved}</strong>
        </article>
        <article className="warning">
          <span>{t("migratedFk.acceptedIssues")}</span>
          <strong>{MIGRATION_STATUS.fk.acceptedIssues}</strong>
          <small>
            {t("migratedFk.affectedRows", {
              count: MIGRATION_STATUS.fk.acceptedAffectedRows,
            })}
          </small>
        </article>
      </section>
      <section className="panel migrated-fk-list">
        <header>
          <div>
            <Network />
            <div>
              <h2>{t("migratedFk.highlightedMappings")}</h2>
              <p>{t("migratedFk.highlightedDescription")}</p>
            </div>
          </div>
        </header>
        <div>
          {MIGRATION_STATUS.fk.mappings.map((mapping) => (
            <article key={mapping.source}>
              <span>
                <code>{mapping.source}</code>
                <small>→</small>
                <code>{mapping.target}</code>
              </span>
              <strong>
                {mapping.resolved.toLocaleString()} /{" "}
                {mapping.total.toLocaleString()}
              </strong>
              <span className="evidence-badge verified">
                <CheckCircle2 />
                {t("migratedFk.databaseVerified")}
              </span>
            </article>
          ))}
        </div>
        <footer>
          <AlertTriangle />
          {t("migratedFk.issueNote", {
            issues: MIGRATION_STATUS.fk.acceptedIssues,
            rows: MIGRATION_STATUS.fk.acceptedAffectedRows,
          })}
        </footer>
      </section>
    </div>
  );
}
