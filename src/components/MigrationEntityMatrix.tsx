import { AlertTriangle, CheckCircle2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import statusData from "@/data/migration-entity-status.generated.json";
import { MIGRATION_STATUS } from "@/data/migration-status";
import { cn } from "@/lib/utils";

type Filter = "all" | "migrated" | "pending" | "issues";

export function MigrationEntityMatrix() {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const number = new Intl.NumberFormat(i18n.language);
  const percent = new Intl.NumberFormat(i18n.language, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const entities = useMemo(() => {
    const query = search.trim().toLowerCase();
    return statusData.entities.filter((entity) => {
      const matchesSearch =
        !query ||
        entity.sourceType.toLowerCase().includes(query) ||
        entity.targetTable.toLowerCase().includes(query);
      const matchesFilter =
        filter === "all" ||
        (filter === "migrated" && entity.status !== "not_started") ||
        (filter === "pending" && entity.status === "not_started") ||
        (filter === "issues" && entity.issueCount > 0);
      return matchesSearch && matchesFilter;
    });
  }, [filter, search]);

  return (
    <section className="panel control-section entity-matrix">
      <header>
        <div>
          <h2>{t("migrationMatrix.title")}</h2>
          <p>{t("migrationMatrix.description")}</p>
        </div>
      </header>
      <div className="entity-matrix-metrics">
        <article>
          <span>{t("migrationMatrix.tableRate")}</span>
          <strong>{percent.format(statusData.totals.tableRate)}</strong>
          <small>
            {statusData.totals.mappedEntities} / {statusData.totals.entities}
          </small>
        </article>
        <article>
          <span>{t("migrationMatrix.recordRate")}</span>
          <strong>{percent.format(statusData.totals.recordRate)}</strong>
          <small>
            {number.format(statusData.totals.migratedRecords)} /{" "}
            {number.format(statusData.totals.sourceRecords)}
          </small>
        </article>
        <article>
          <span>{t("migrationMatrix.remaining")}</span>
          <strong>{number.format(statusData.totals.remainingRecords)}</strong>
          <small>{t("migrationMatrix.records")}</small>
        </article>
        <article className={statusData.totals.issueCount ? "warning" : "success"}>
          <span>{t("migrationMatrix.issues")}</span>
          <strong>{statusData.totals.issueCount}</strong>
          <small>
            {t("migrationMatrix.affectedRows", {
              count: statusData.totals.affectedRows,
            })}
          </small>
        </article>
      </div>
      <div className="entity-matrix-toolbar">
        <div className="entity-filter-buttons">
          {(["all", "migrated", "pending", "issues"] as const).map((key) => (
            <button
              className={cn(filter === key && "active")}
              key={key}
              type="button"
              onClick={() => setFilter(key)}
            >
              {t(`migrationMatrix.filters.${key}`)}
            </button>
          ))}
        </div>
        <label>
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("migrationMatrix.search")}
          />
        </label>
      </div>
      <div className="entity-matrix-table-wrap">
        <table className="entity-matrix-table">
          <thead>
            <tr>
              <th>{t("migrationMatrix.source")}</th>
              <th>{t("migrationMatrix.target")}</th>
              <th>{t("migrationMatrix.strategy")}</th>
              <th>{t("migrationMatrix.sourceCount")}</th>
              <th>{t("migrationMatrix.migrated")}</th>
              <th>{t("migrationMatrix.remaining")}</th>
              <th>{t("migrationMatrix.rate")}</th>
              <th>{t("migrationMatrix.status")}</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((entity) => (
              <tr key={entity.sourceType}>
                <td><code>{entity.sourceType}</code></td>
                <td><code>{entity.targetTable}</code></td>
                <td>{t(`migrationMatrix.strategies.${entity.strategy}`)}</td>
                <td>{number.format(entity.sourceCount)}</td>
                <td>{number.format(entity.migratedCount)}</td>
                <td>{number.format(entity.remainingCount)}</td>
                <td>
                  <span className="entity-rate">
                    <i style={{ width: `${entity.rate * 100}%` }} />
                    <strong>{percent.format(entity.rate)}</strong>
                  </span>
                </td>
                <td>
                  <span className={cn("entity-migration-status", entity.status)}>
                    {entity.status === "complete" ? (
                      <CheckCircle2 />
                    ) : (
                      <AlertTriangle />
                    )}
                    {t(`migrationMatrix.statuses.${entity.status}`)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="editor-only-mappings">
        <header>
          <h3>{t("migrationMatrix.editorOnlyTitle")}</h3>
          <p>{t("migrationMatrix.editorOnlyDescription")}</p>
        </header>
        <div>
          {MIGRATION_STATUS.editorOnlyMappings.map((mapping) => (
            <article key={mapping.sourceType}>
              <code>{mapping.sourceType}</code>
              <span>→</span>
              <code>{mapping.targetTable}</code>
              <strong className={cn("editor-mapping-status", mapping.status)}>
                {t(`migrationMatrix.editorStatuses.${mapping.status}`)}
              </strong>
              <small>
                {mapping.status === "approved"
                  ? t("migrationMatrix.adoptedRows", {
                      count: mapping.targetRows,
                    })
                  : t(`migrationMatrix.editorNotes.${mapping.note}`)}
              </small>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
