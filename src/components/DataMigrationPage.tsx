import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleAlert,
  Database,
  Folder,
  Network,
  LoaderCircle,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { BubbleRelationshipGraph } from "@/components/BubbleRelationshipGraph";
import { BUBBLE_ENTITY_GROUPS } from "@/data/bubble-entity-groups";
import { MIGRATION_STATUS } from "@/data/migration-status";
import {
  BUBBLE_OBJECT_TYPES,
  CORE_BUBBLE_OBJECT_TYPES,
  isCoreBubbleObjectType,
  type BubbleObjectType,
} from "@/data/bubble-object-types";
import bubbleSchema from "@/data/bubble-schema.generated.json";
import {
  buildBubbleObjectUrl,
  DEFAULT_BUBBLE_BASE_URL,
  fetchBubbleObjectSummary,
} from "@/lib/bubble-api";
import {
  analyzeBubbleRelationships,
  type BubbleRelationshipReport,
} from "@/lib/bubble-relations";
import { cn } from "@/lib/utils";

type GeneratedSchemaInventory = {
  entityCount: number;
  fieldCount: number;
  relationshipCount: number;
  entities: Array<{
    sourceType: string;
    schemaType: string;
    fieldCount: number;
    fields: Array<{ targetSourceType: string | null; isMetadata: boolean }>;
  }>;
  relationships: Array<{
    sourceSchemaType: string;
    targetSchemaType: string;
    isMetadata: boolean;
  }>;
};

const generatedSchema = bubbleSchema as GeneratedSchemaInventory;
const generatedEntityByType = new Map(
  generatedSchema.entities.map((entity) => [entity.sourceType, entity]),
);

type ScanResult =
  | { status: "idle" | "loading" }
  | { status: "success"; count: number; requestUrl: string }
  | { status: "error"; message: string };

type ExecutionLogEntry = {
  id: number;
  time: string;
  message: string;
  tone: "info" | "success" | "error";
};

const initialResults = Object.fromEntries(
  BUBBLE_OBJECT_TYPES.map((objectType) => [
    objectType,
    { status: "idle" } satisfies ScanResult,
  ]),
) as Record<BubbleObjectType, ScanResult>;

export function DataMigrationPage() {
  const { t } = useTranslation();
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BUBBLE_BASE_URL);
  const [search, setSearch] = useState("");
  const [results, setResults] =
    useState<Record<BubbleObjectType, ScanResult>>(initialResults);
  const [executionLog, setExecutionLog] = useState<ExecutionLogEntry[]>([]);
  const [relationshipReport, setRelationshipReport] =
    useState<BubbleRelationshipReport | null>(null);
  const [analyzingType, setAnalyzingType] =
    useState<BubbleObjectType | null>(null);
  const [relationshipError, setRelationshipError] = useState<string | null>(
    null,
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(["customerCrm", "ordersQuotes"]),
  );
  const logIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const appendLog = (
    message: string,
    tone: ExecutionLogEntry["tone"] = "info",
  ) => {
    const time = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Hong_Kong",
    }).format(new Date());

    setExecutionLog((current) =>
      [
        {
          id: ++logIdRef.current,
          time,
          message,
          tone,
        },
        ...current,
      ].slice(0, 500),
    );
  };

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  const filteredObjectTypes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return BUBBLE_OBJECT_TYPES;
    return BUBBLE_OBJECT_TYPES.filter((objectType) =>
      objectType.toLocaleLowerCase().includes(query),
    );
  }, [search]);

  const filteredGroups = useMemo(() => {
    const visibleTypes = new Set<string>(filteredObjectTypes);
    return BUBBLE_ENTITY_GROUPS.map((group) => ({
      ...group,
      objectTypes: group.objectTypes.filter((objectType) =>
        visibleTypes.has(objectType),
      ),
    })).filter((group) => group.objectTypes.length > 0);
  }, [filteredObjectTypes]);

  const summary = useMemo(() => {
    const values = Object.values(results);
    return {
      success: values.filter((result) => result.status === "success").length,
      error: values.filter((result) => result.status === "error").length,
      loading: values.filter((result) => result.status === "loading").length,
    };
  }, [results]);

  const progress = Math.round(
    (summary.success / BUBBLE_OBJECT_TYPES.length) * 100,
  );

  const previewUrl = useMemo(() => {
    try {
      const url = buildBubbleObjectUrl(
        baseUrl,
        filteredObjectTypes[0] ?? BUBBLE_OBJECT_TYPES[0],
      );
      url.search = "";
      return url.toString();
    } catch {
      return t("migration.invalidBaseUrl");
    }
  }, [baseUrl, filteredObjectTypes, t]);

  const fetchObject = async (
    objectType: BubbleObjectType,
    controller: AbortController,
    logResult = false,
  ) => {
    if (logResult) {
      appendLog(t("migration.log.scanOneStart", { objectType }));
    }
    setResults((current) => ({
      ...current,
      [objectType]: { status: "loading" },
    }));

    try {
      const result = await fetchBubbleObjectSummary(
        baseUrl,
        objectType,
      );
      if (controller.signal.aborted) return;
      setResults((current) => ({
        ...current,
        [objectType]: { status: "success", ...result },
      }));
      if (logResult) {
        appendLog(
          t("migration.log.scanOneSuccess", {
            objectType,
            count: result.count.toLocaleString(),
          }),
          "success",
        );
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const message =
        error instanceof Error ? error.message : t("migration.fetchError");
      setResults((current) => ({
        ...current,
        [objectType]: {
          status: "error",
          message,
        },
      }));
      if (logResult) {
        appendLog(
          t("migration.log.scanOneError", { objectType, message }),
          "error",
        );
      }
    }
  };

  const scanAll = async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    appendLog(t("migration.log.scanAllStart"));

    setResults(
      Object.fromEntries(
        BUBBLE_OBJECT_TYPES.map((objectType) => [
          objectType,
          { status: "loading" } satisfies ScanResult,
        ]),
      ) as Record<BubbleObjectType, ScanResult>,
    );

    const batchSize = 6;
    for (let index = 0; index < BUBBLE_OBJECT_TYPES.length; index += batchSize) {
      if (controller.signal.aborted) return;
      const batch = BUBBLE_OBJECT_TYPES.slice(index, index + batchSize);
      await Promise.all(
        batch.map((objectType) => fetchObject(objectType, controller)),
      );
      appendLog(
        t("migration.log.scanBatch", {
          current: Math.ceil((index + batch.length) / batchSize),
          total: Math.ceil(BUBBLE_OBJECT_TYPES.length / batchSize),
        }),
      );
    }
    appendLog(t("migration.log.scanAllComplete"), "success");
  };

  const scanOne = async (objectType: BubbleObjectType) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    await fetchObject(objectType, controller, true);
  };

  const analyzeRelationships = async (objectType: BubbleObjectType) => {
    setAnalyzingType(objectType);
    setRelationshipError(null);
    appendLog(t("migration.log.relationshipStart", { objectType }));

    try {
      const report = await analyzeBubbleRelationships(objectType);
      setRelationshipReport(report);
      appendLog(
        t("migration.log.relationshipSuccess", {
          objectType,
          count: report.relationshipCount,
        }),
        "success",
      );
      document
        .getElementById("relationship-analysis")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("migration.relationships.analysisError");
      setRelationshipReport(null);
      setRelationshipError(message);
      appendLog(
        t("migration.log.relationshipError", { objectType, message }),
        "error",
      );
    } finally {
      setAnalyzingType(null);
    }
  };

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const renderObjectRow = (objectType: BubbleObjectType) => {
    const result = results[objectType];
    const schemaEntity = generatedEntityByType.get(objectType);
    const candidateRelationships =
      schemaEntity?.fields.filter(
        (field) => field.targetSourceType && !field.isMetadata,
      ).length ?? 0;
    const incomingRelationships = schemaEntity
      ? generatedSchema.relationships.filter(
          (relationship) =>
            relationship.targetSchemaType === schemaEntity.schemaType &&
            !relationship.isMetadata,
        ).length
      : 0;

    return (
      <div className="migration-object-row" key={objectType}>
        <div>
          <strong>{objectType}</strong>
          <code>{encodeURIComponent(objectType)}</code>
          <span className="migration-entity-meta">
            <span
              className={cn(
                "migration-entity-role",
                isCoreBubbleObjectType(objectType) && "core",
              )}
            >
              {isCoreBubbleObjectType(objectType)
                ? t("migration.core")
                : t("migration.supporting")}
            </span>
            <span className="migration-schema-relations">
              <Network />
              {t("migration.relationships.candidateCount", {
                count: candidateRelationships + incomingRelationships,
              })}
            </span>
          </span>
        </div>
        <span className="migration-record-count">
          {result.status === "success"
            ? result.count === 0
              ? t("migration.zeroOk")
              : result.count.toLocaleString()
            : "—"}
        </span>
        <span
          className={cn("migration-status", result.status)}
          title={result.status === "error" ? result.message : undefined}
        >
          {result.status === "loading" && <LoaderCircle className="spin" />}
          {result.status === "success" && <Check />}
          {result.status === "error" && <CircleAlert />}
          {t(`migration.statuses.${result.status}`)}
        </span>
        <div className="migration-row-actions">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void scanOne(objectType)}
            disabled={result.status === "loading"}
          >
            <RefreshCw />
            {t("migration.fetchOne")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void analyzeRelationships(objectType)}
            disabled={analyzingType !== null}
          >
            {analyzingType === objectType ? (
              <LoaderCircle className="spin" />
            ) : (
              <Network />
            )}
            {t("migration.relationships.analyze")}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="migration-page">
      <section className="migration-warning">
        <AlertTriangle />
        <div>
          <strong>{t("migration.productionTitle")}</strong>
          <p>{t("migration.productionDescription")}</p>
        </div>
        <span>{t("migration.researchMode")}</span>
      </section>

      <section className="migration-hero">
        <div>
          <span className="eyebrow">{t("migration.eyebrow")}</span>
          <h1>{t("migration.title")}</h1>
          <p>{t("migration.description")}</p>
        </div>
        <Button onClick={() => void scanAll()} disabled={summary.loading > 0}>
          {summary.loading > 0 ? (
            <LoaderCircle className="spin" />
          ) : (
            <RefreshCw />
          )}
          {summary.loading > 0
            ? t("migration.scanning")
            : t("migration.scanAll")}
        </Button>
      </section>

      <section className="fk-verification-summary panel">
        <header>
          <div>
            <ShieldCheck />
            <div>
              <h2>{t("migration.fkSummary.title")}</h2>
              <p>{t("migration.fkSummary.description")}</p>
            </div>
          </div>
          <span className="evidence-badge verified">
            {t("migration.fkSummary.databaseVerified")}
          </span>
        </header>
        <div className="fk-summary-metrics">
          <article className="success">
            <span>{t("migration.fkSummary.migratedUnresolved")}</span>
            <strong>{MIGRATION_STATUS.fk.migratedUnresolved}</strong>
          </article>
          <article>
            <span>{t("migration.fkSummary.verifiedRows")}</span>
            <strong>
              {MIGRATION_STATUS.fk.databaseVerifiedReferenceRows.toLocaleString()}
            </strong>
          </article>
          <article className="warning">
            <span>{t("migration.fkSummary.currentIssue")}</span>
            <strong>{MIGRATION_STATUS.fk.currentOpenIssues}</strong>
            <small>
              {t("migration.fkSummary.affectedRows", {
                count: MIGRATION_STATUS.fk.currentAffectedRows,
              })}
            </small>
          </article>
          <article className="danger">
            <span>{t("migration.fkSummary.futureOrphans")}</span>
            <strong>{MIGRATION_STATUS.fk.knownFutureOrphanReferences}</strong>
          </article>
        </div>
        <div className="fk-verified-mappings">
          {MIGRATION_STATUS.fk.mappings.map((mapping) => (
            <div key={mapping.source}>
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
                {t("migration.fkSummary.databaseVerified")}
              </span>
            </div>
          ))}
        </div>
        <p className="fk-summary-note">
          <AlertTriangle />
          {t("migration.fkSummary.orphanNote")}
        </p>
      </section>

      <section className="migration-metrics">
        <article>
          <Database />
          <span>{t("migration.totalObjects")}</span>
          <strong>{BUBBLE_OBJECT_TYPES.length}</strong>
        </article>
        <article>
          <Database />
          <span>{t("migration.coreObjects")}</span>
          <strong>{CORE_BUBBLE_OBJECT_TYPES.length}</strong>
        </article>
        <article className="success">
          <Check />
          <span>{t("migration.fetched")}</span>
          <strong>{summary.success}</strong>
        </article>
        <article className="danger">
          <CircleAlert />
          <span>{t("migration.failed")}</span>
          <strong>{summary.error}</strong>
        </article>
      </section>

      <section className="migration-progress" aria-label={t("migration.progress")}>
        <div>
          <span>{t("migration.progress")}</span>
          <strong>{progress}%</strong>
        </div>
        <div className="migration-progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="migration-source panel">
        <header>
          <div>
            <Server />
            <div>
              <h2>{t("migration.sourceTitle")}</h2>
              <p>{t("migration.sourceDescription")}</p>
            </div>
          </div>
        </header>
        <div className="migration-source-fields">
          <label>
            <span>{t("migration.baseUrl")}</span>
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              spellCheck={false}
            />
          </label>
        </div>
        <p className="migration-url-preview">
          <span>{t("migration.urlPreview")}</span>
          <code>{previewUrl}</code>
        </p>
      </section>

      <section className="migration-table-controls panel">
        <header className="migration-table-header">
          <div>
            <h2>{t("migration.objectList")}</h2>
            <p>
              {t("migration.objectCount", {
                visible: filteredObjectTypes.length,
                total: BUBBLE_OBJECT_TYPES.length,
              })}
            </p>
          </div>
          <label className="migration-search">
            <Search />
            <span className="sr-only">{t("migration.searchObjects")}</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("migration.searchObjects")}
            />
          </label>
        </header>
      </section>

      <div className="migration-groups">
        {filteredGroups.map((group, groupIndex) => {
          const isExpanded =
            Boolean(search.trim()) || expandedGroups.has(group.key);
          const groupResults = group.objectTypes.map(
            (objectType) => results[objectType],
          );
          const successful = groupResults.filter(
            (result) => result.status === "success",
          ).length;
          const failed = groupResults.filter(
            (result) => result.status === "error",
          ).length;
          const percentage = Math.round(
            (successful / group.objectTypes.length) * 100,
          );
          const coreCount = group.objectTypes.filter((objectType) =>
            isCoreBubbleObjectType(objectType),
          ).length;

          return (
            <section
              className={cn(
                "migration-group panel",
                `tone-${(groupIndex % 5) + 1}`,
              )}
              key={group.key}
            >
              <button
                className="migration-group-toggle"
                type="button"
                onClick={() => toggleGroup(group.key)}
                aria-expanded={isExpanded}
              >
                <div>
                  <span className="migration-group-icon">
                    <Folder />
                  </span>
                  <span>
                    <strong>
                      {t(`migration.groups.${group.key}`)}
                    </strong>
                    <small>
                      {t("migration.groupSummary", {
                        total: group.objectTypes.length,
                        core: coreCount,
                        supporting: group.objectTypes.length - coreCount,
                        success: successful,
                        failed,
                      })}
                    </small>
                  </span>
                </div>
                <span className="migration-group-percentage">
                  <strong>{percentage}%</strong>
                  <ChevronDown />
                </span>
              </button>
              <div className="migration-group-progress">
                <span style={{ width: `${percentage}%` }} />
              </div>

              {isExpanded && (
                <div className="migration-object-list">
                  <div className="migration-list-head" aria-hidden="true">
                    <span>{t("migration.objectName")}</span>
                    <span>{t("migration.records")}</span>
                    <span>{t("migration.status")}</span>
                    <span />
                  </div>
                  {group.objectTypes.map((objectType) =>
                    renderObjectRow(objectType),
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <section
        className="relationship-analysis panel"
        id="relationship-analysis"
      >
        <header className="relationship-analysis-header">
          <div>
            <span className="relationship-analysis-icon">
              <Network />
            </span>
            <div>
              <h2>{t("migration.relationships.title")}</h2>
              <p>
                {t("migration.relationships.description", {
                  entities: generatedSchema.entityCount,
                  fields: generatedSchema.fieldCount.toLocaleString(),
                  relationships:
                    generatedSchema.relationshipCount.toLocaleString(),
                })}
              </p>
              <span className="evidence-badge inferred">
                {t("migration.fkSummary.inferredSample")}
              </span>
            </div>
          </div>
          {relationshipReport && (
            <span className="relationship-analyzed-at">
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Hong_Kong",
              }).format(new Date(relationshipReport.analyzedAt))}
            </span>
          )}
        </header>

        {analyzingType && (
          <div className="relationship-analysis-loading">
            <LoaderCircle className="spin" />
            <span>
              {t("migration.relationships.analyzing", {
                objectType: analyzingType,
              })}
            </span>
          </div>
        )}

        {relationshipError && !analyzingType && (
          <div className="relationship-analysis-error" role="alert">
            <CircleAlert />
            <span>{relationshipError}</span>
          </div>
        )}

        {!relationshipReport && !analyzingType && !relationshipError && (
          <div className="relationship-analysis-empty">
            <Network />
            <h3>{t("migration.relationships.emptyTitle")}</h3>
            <p>{t("migration.relationships.emptyDescription")}</p>
          </div>
        )}

        {relationshipReport && !analyzingType && (
          <div className="relationship-report">
            <div className="relationship-report-title">
              <div>
                <span>{t("migration.relationships.selectedEntity")}</span>
                <h3>{relationshipReport.sourceType}</h3>
              </div>
              <code>{relationshipReport.sourceSchemaType}</code>
            </div>

            <div className="relationship-metrics">
              <article>
                <span>{t("migration.relationships.sourceRecordCount")}</span>
                <strong>
                  {relationshipReport.sourceCount.toLocaleString()}
                </strong>
              </article>
              <article>
                <span>{t("migration.relationships.sampledRecords")}</span>
                <strong>{relationshipReport.sampleSize}</strong>
              </article>
              <article>
                <span>{t("migration.relationships.relationshipsFound")}</span>
                <strong>{relationshipReport.relationshipCount}</strong>
              </article>
              <article
                className={cn(
                  relationshipReport.relationships.some(
                    (item) => item.orphanReferences > 0,
                  ) && "danger",
                )}
              >
                <span>{t("migration.relationships.sampledOrphans")}</span>
                <strong>
                  {relationshipReport.relationships.reduce(
                    (total, item) => total + item.orphanReferences,
                    0,
                  )}
                </strong>
              </article>
            </div>

            {relationshipReport.relationships.length > 0 ? (
              <>
                <BubbleRelationshipGraph report={relationshipReport} />
                <div className="relationship-table-wrap">
                  <table className="relationship-table">
                    <thead>
                      <tr>
                        <th>{t("migration.relationships.sourceField")}</th>
                        <th>{t("migration.relationships.targetEntity")}</th>
                        <th>{t("migration.relationships.cardinality")}</th>
                        <th>{t("migration.relationships.confidence")}</th>
                        <th>{t("migration.relationships.references")}</th>
                        <th>{t("migration.relationships.orphans")}</th>
                        <th>{t("migration.relationships.targetMapping")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relationshipReport.relationships.map((relationship) => (
                        <tr
                          key={`${relationship.sourceField}-${relationship.targetSchemaType}`}
                        >
                          <td>
                            <strong>{relationship.sourceField}</strong>
                          </td>
                          <td>
                            <code>{relationship.targetSchemaType}</code>
                          </td>
                          <td>
                            <span
                              className={cn(
                                "relationship-cardinality",
                                relationship.isArray && "array",
                              )}
                            >
                              {t(
                                `migration.relationships.cardinalities.${relationship.cardinality}`,
                              )}
                            </span>
                          </td>
                          <td>
                            <span className="relationship-confidence">
                              <i
                                style={{
                                  width: `${relationship.confidence}%`,
                                }}
                              />
                              <strong>{relationship.confidence}%</strong>
                            </span>
                          </td>
                          <td>
                            {t("migration.relationships.referenceSummary", {
                              sampled: relationship.sampledReferences,
                              verified: relationship.verifiedReferences,
                            })}
                          </td>
                          <td>
                            <span
                              className={cn(
                                "relationship-orphan-count",
                                relationship.orphanReferences > 0 && "danger",
                              )}
                              title={relationship.orphanSample.join(", ")}
                            >
                              {relationship.orphanReferences}
                            </span>
                          </td>
                          <td>
                            <span className="relationship-field-mapping">
                              <code>{relationship.targetField}</code>
                              <small>
                                {relationship.isArray
                                  ? t(
                                      "migration.relationships.junctionMapping",
                                    )
                                  : t("migration.relationships.uuidForeignKey")}
                              </small>
                              <span className="evidence-badge inferred">
                                {t("migration.fkSummary.inferred")}
                              </span>
                              <code>{relationship.legacySourceField}</code>
                              <small>
                                {t("migration.relationships.legacySource")}
                              </small>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="relationship-privacy-note">
                  {t("migration.relationships.privacyNote")}
                </p>
              </>
            ) : (
              <div className="relationship-analysis-empty compact">
                <Network />
                <h3>{t("migration.relationships.noRelations")}</h3>
                <p>{t("migration.relationships.noRelationsDescription")}</p>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="migration-execution-log">
        <header>
          <h2>
            <Terminal />
            {t("migration.executionLog")}
          </h2>
          <button
            type="button"
            onClick={() => setExecutionLog([])}
            disabled={executionLog.length === 0}
          >
            {t("migration.clearLog")}
          </button>
        </header>
        <div className="migration-log-content" role="log" aria-live="polite">
          {executionLog.length === 0 ? (
            <p>{t("migration.emptyLog")}</p>
          ) : (
            executionLog.map((entry) => (
              <p className={entry.tone} key={entry.id}>
                <time>[{entry.time}]</time>
                <span>{entry.message}</span>
              </p>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

