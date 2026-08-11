import {
  AlertTriangle,
  Check,
  CircleAlert,
  Database,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Search,
  Server,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  BUBBLE_OBJECT_TYPES,
  type BubbleObjectType,
} from "@/data/bubble-object-types";
import {
  buildBubbleObjectUrl,
  DEFAULT_BUBBLE_BASE_URL,
  fetchBubbleObjectSummary,
} from "@/lib/bubble-api";
import { cn } from "@/lib/utils";

type ScanResult =
  | { status: "idle" | "loading" }
  | { status: "success"; count: number; requestUrl: string }
  | { status: "error"; message: string };

const initialResults = Object.fromEntries(
  BUBBLE_OBJECT_TYPES.map((objectType) => [
    objectType,
    { status: "idle" } satisfies ScanResult,
  ]),
) as Record<BubbleObjectType, ScanResult>;

export function DataMigrationPage() {
  const { t } = useTranslation();
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BUBBLE_BASE_URL);
  const [apiToken, setApiToken] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] =
    useState<Record<BubbleObjectType, ScanResult>>(initialResults);
  const controllerRef = useRef<AbortController | null>(null);

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
  ) => {
    setResults((current) => ({
      ...current,
      [objectType]: { status: "loading" },
    }));

    try {
      const result = await fetchBubbleObjectSummary(
        baseUrl,
        objectType,
        apiToken,
        controller.signal,
      );
      setResults((current) => ({
        ...current,
        [objectType]: { status: "success", ...result },
      }));
    } catch (error) {
      if (controller.signal.aborted) return;
      setResults((current) => ({
        ...current,
        [objectType]: {
          status: "error",
          message:
            error instanceof Error ? error.message : t("migration.fetchError"),
        },
      }));
    }
  };

  const scanAll = async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

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
    }
  };

  const scanOne = async (objectType: BubbleObjectType) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    await fetchObject(objectType, controller);
  };

  return (
    <div className="migration-page">
      <section className="migration-warning">
        <AlertTriangle />
        <div>
          <strong>{t("migration.productionTitle")}</strong>
          <p>{t("migration.productionDescription")}</p>
        </div>
        <span>{t("migration.readOnly")}</span>
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
          <label>
            <span>
              <KeyRound />
              {t("migration.apiToken")}
            </span>
            <input
              type="password"
              value={apiToken}
              onChange={(event) => setApiToken(event.target.value)}
              placeholder={t("migration.apiTokenPlaceholder")}
              autoComplete="off"
            />
          </label>
        </div>
        <p className="migration-url-preview">
          <span>{t("migration.urlPreview")}</span>
          <code>{previewUrl}</code>
        </p>
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
            return (
              <div className="migration-object-row" key={objectType}>
                <div>
                  <strong>{objectType}</strong>
                  <code>{encodeURIComponent(objectType)}</code>
                </div>
                <span className="migration-record-count">
                  {result.status === "success" ? result.count : "—"}
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
    </div>
  );
}

