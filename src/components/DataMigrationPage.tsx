import {
  AlertTriangle,
  Check,
  CircleAlert,
  Database,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Search,
  Server,
  Terminal,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  BUBBLE_OBJECT_TYPES,
  CORE_BUBBLE_OBJECT_TYPES,
  isCoreBubbleObjectType,
  type BubbleObjectType,
} from "@/data/bubble-object-types";
import {
  buildBubbleObjectUrl,
  DEFAULT_BUBBLE_BASE_URL,
  fetchBubbleObjectSummary,
} from "@/lib/bubble-api";
import {
  completeResearchMigration,
  importBubblePage,
  MIGRATION_CONFIRMATION_TEXT,
  resetResearchMigration,
} from "@/lib/bubble-migration";
import { cn } from "@/lib/utils";

type ScanResult =
  | { status: "idle" | "loading" }
  | { status: "success"; count: number; requestUrl: string }
  | { status: "error"; message: string };

type ImportResult =
  | { status: "idle"; imported: 0 }
  | {
      status: "running" | "success";
      imported: number;
      sourceCount: number;
    }
  | { status: "error"; imported: number; message: string };

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

const initialImportResults = Object.fromEntries(
  BUBBLE_OBJECT_TYPES.map((objectType) => [
    objectType,
    { status: "idle", imported: 0 } satisfies ImportResult,
  ]),
) as Record<BubbleObjectType, ImportResult>;

export function DataMigrationPage() {
  const { t } = useTranslation();
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BUBBLE_BASE_URL);
  const [search, setSearch] = useState("");
  const [results, setResults] =
    useState<Record<BubbleObjectType, ScanResult>>(initialResults);
  const [importResults, setImportResults] =
    useState<Record<BubbleObjectType, ImportResult>>(initialImportResults);
  const [confirmation, setConfirmation] = useState("");
  const [migrationRunning, setMigrationRunning] = useState(false);
  const [migrationRunId, setMigrationRunId] = useState<string | null>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [executionLog, setExecutionLog] = useState<ExecutionLogEntry[]>([]);
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

  const summary = useMemo(() => {
    const values = Object.values(results);
    return {
      success: values.filter((result) => result.status === "success").length,
      error: values.filter((result) => result.status === "error").length,
      loading: values.filter((result) => result.status === "loading").length,
    };
  }, [results]);

  const completed = summary.success + summary.error;
  const progress = Math.round((completed / BUBBLE_OBJECT_TYPES.length) * 100);
  const importSummary = useMemo(() => {
    const values = Object.values(importResults);
    return {
      completed: values.filter((result) => result.status === "success").length,
      failed: values.filter((result) => result.status === "error").length,
      records: values.reduce((total, result) => total + result.imported, 0),
    };
  }, [importResults]);
  const importProgress = Math.round(
    ((importSummary.completed + importSummary.failed) /
      BUBBLE_OBJECT_TYPES.length) *
      100,
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

  const runMigration = async () => {
    if (
      migrationRunning ||
      confirmation.trim() !== MIGRATION_CONFIRMATION_TEXT
    ) {
      return;
    }

    setMigrationRunning(true);
    setMigrationError(null);
    setMigrationRunId(null);
    setImportResults(initialImportResults);
    appendLog(t("migration.log.migrationReset"));

    try {
      const { run, sourceTypes } = await resetResearchMigration(
        baseUrl,
        confirmation.trim(),
      );
      setMigrationRunId(run.id);
      appendLog(
        t("migration.log.migrationStarted", {
          runId: run.id,
          count: sourceTypes.length,
        }),
        "success",
      );

      const allowedTypes = new Set<string>(BUBBLE_OBJECT_TYPES);
      const migrationTypes = sourceTypes.filter(
        (sourceType): sourceType is BubbleObjectType =>
          allowedTypes.has(sourceType),
      );
      let nextIndex = 0;

      const worker = async () => {
        while (nextIndex < migrationTypes.length) {
          const objectType = migrationTypes[nextIndex++];
          let cursor = 0;
          let imported = 0;

          setImportResults((current) => ({
            ...current,
            [objectType]: {
              status: "running",
              imported: 0,
              sourceCount: 0,
            },
          }));

          try {
            let done = false;
            while (!done) {
              let page: Awaited<ReturnType<typeof importBubblePage>> | null =
                null;
              let lastError: unknown;

              for (let attempt = 0; attempt < 3 && !page; attempt += 1) {
                try {
                  page = await importBubblePage(run.id, objectType, cursor);
                } catch (error) {
                  lastError = error;
                  if (attempt < 2) {
                    await new Promise((resolve) =>
                      window.setTimeout(resolve, 750 * 2 ** attempt),
                    );
                  }
                }
              }

              if (!page) throw lastError;
              cursor = page.nextCursor;
              imported = page.importedTotal;
              done = page.done;

              setImportResults((current) => ({
                ...current,
                [objectType]: {
                  status: done ? "success" : "running",
                  imported,
                  sourceCount: page.sourceCount,
                },
              }));
              setResults((current) => ({
                ...current,
                [objectType]: {
                  status: "success",
                  count: page.sourceCount,
                  requestUrl: buildBubbleObjectUrl(
                    baseUrl,
                    objectType,
                  ).toString(),
                },
              }));
            }
            appendLog(
              t("migration.log.entityComplete", {
                objectType,
                count: imported.toLocaleString(),
              }),
              "success",
            );
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : t("migration.migrateError");
            setImportResults((current) => ({
              ...current,
              [objectType]: {
                status: "error",
                imported,
                message,
              },
            }));
            appendLog(
              t("migration.log.entityError", { objectType, message }),
              "error",
            );
          }
        }
      };

      await Promise.all(Array.from({ length: 4 }, () => worker()));
      await completeResearchMigration(run.id);
      appendLog(
        t("migration.log.migrationComplete", {
          completed: migrationTypes.length,
        }),
        "success",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("migration.migrateError");
      setMigrationError(message);
      appendLog(
        t("migration.log.migrationError", { message }),
        "error",
      );
    } finally {
      setMigrationRunning(false);
    }
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

      <section className="migration-action panel">
        <header>
          <div>
            <Trash2 />
            <div>
              <h2>{t("migration.migrateTitle")}</h2>
              <p>{t("migration.migrateDescription")}</p>
            </div>
          </div>
        </header>
        <div className="migration-confirmation">
          <label>
            <span>
              <LockKeyhole />
              {t("migration.confirmationLabel")}
            </span>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={MIGRATION_CONFIRMATION_TEXT}
              disabled={migrationRunning}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <Button
            variant="destructive"
            onClick={() => void runMigration()}
            disabled={
              migrationRunning ||
              confirmation.trim() !== MIGRATION_CONFIRMATION_TEXT
            }
          >
            {migrationRunning ? (
              <LoaderCircle className="spin" />
            ) : (
              <Trash2 />
            )}
            {migrationRunning
              ? t("migration.migrating")
              : t("migration.clearAndMigrate")}
          </Button>
        </div>
        <p className="migration-confirmation-note">
          {t("migration.confirmationHelp", {
            sentence: MIGRATION_CONFIRMATION_TEXT,
          })}
        </p>
        {(migrationRunning ||
          importSummary.completed > 0 ||
          importSummary.failed > 0) && (
          <div className="migration-run-progress">
            <div>
              <span>
                {t("migration.importSummary", {
                  completed: importSummary.completed,
                  failed: importSummary.failed,
                  records: importSummary.records.toLocaleString(),
                })}
              </span>
              <strong>{importProgress}%</strong>
            </div>
            <div className="migration-progress-track">
              <span style={{ width: `${importProgress}%` }} />
            </div>
            {migrationRunId && (
              <code>
                {t("migration.runId")}: {migrationRunId}
              </code>
            )}
          </div>
        )}
        {migrationError && (
          <div className="migration-action-error" role="alert">
            <CircleAlert />
            <span>{migrationError}</span>
          </div>
        )}
      </section>

      <section className="migration-table panel">
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

        <div className="migration-object-list">
          <div className="migration-list-head" aria-hidden="true">
            <span>{t("migration.objectName")}</span>
            <span>{t("migration.records")}</span>
            <span>{t("migration.status")}</span>
            <span />
          </div>
          {filteredObjectTypes.map((objectType) => {
            const result = results[objectType];
            const importResult = importResults[objectType];
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
                    {importResult.status !== "idle" && (
                      <span
                        className={cn(
                          "migration-import-state",
                          importResult.status,
                        )}
                      >
                        {t(
                          `migration.importStatuses.${importResult.status}`,
                          { count: importResult.imported.toLocaleString() },
                        )}
                      </span>
                    )}
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void scanOne(objectType)}
                  disabled={result.status === "loading"}
                >
                  <RefreshCw />
                  {t("migration.fetchOne")}
                </Button>
              </div>
            );
          })}
        </div>
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

