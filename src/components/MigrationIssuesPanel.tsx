import { AlertTriangle, CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  MIGRATION_ISSUE_GROUPS,
  MIGRATION_RECONCILIATION_WARNINGS,
} from "@/data/migration-issues";
import { cn } from "@/lib/utils";

export function MigrationIssuesPanel() {
  const { t } = useTranslation();
  const issueCount = MIGRATION_ISSUE_GROUPS.reduce(
    (sum, issue) => sum + issue.issues,
    0,
  );
  const affectedRows = MIGRATION_ISSUE_GROUPS.reduce(
    (sum, issue) => sum + issue.affectedRows,
    0,
  );

  return (
    <section className="panel control-section migration-issues-panel">
      <header>
        <div>
          <h2>{t("migrationIssues.title")}</h2>
          <p>
            {t("migrationIssues.description", { issueCount, affectedRows })}
          </p>
        </div>
      </header>
      <div className="migration-issue-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("migrationIssues.phase")}</th>
              <th>{t("migrationIssues.source")}</th>
              <th>{t("migrationIssues.target")}</th>
              <th>{t("migrationIssues.issueCount")}</th>
              <th>{t("migrationIssues.affected")}</th>
              <th>{t("migrationIssues.status")}</th>
            </tr>
          </thead>
          <tbody>
            {MIGRATION_ISSUE_GROUPS.map((issue) => (
              <tr key={issue.key}>
                <td><strong>{issue.phase}</strong></td>
                <td><code>{issue.source}</code></td>
                <td><code>{issue.target}</code></td>
                <td>{issue.issues}</td>
                <td>{issue.affectedRows}</td>
                <td>
                  <span className="issue-status accepted">
                    <AlertTriangle />
                    {t(`migrationIssues.statuses.${issue.status}`)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="reconciliation-warning-grid">
        {MIGRATION_RECONCILIATION_WARNINGS.map((warning) => (
          <article className={cn(warning.severity)} key={warning.key}>
            <CircleAlert />
            <div>
              <span>{t(`migrationIssues.warnings.${warning.key}`)}</span>
              <strong>{warning.value}</strong>
              <small>
                {t(`migrationIssues.statuses.${warning.status}`)}
              </small>
            </div>
          </article>
        ))}
      </div>
      <p className="migration-issue-note">
        <AlertTriangle />
        {t("migrationIssues.note")}
      </p>
    </section>
  );
}
