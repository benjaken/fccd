import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  FileArchive,
  LoaderCircle,
  Play,
  Search,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import fileStatus from "@/data/file-migration-status.generated.json";
import { supabase } from "@/lib/supabase";

type UploadedFileRecord = {
  _id: string;
  app_version_text: string;
  appname_text: string;
  content_type_text: string;
  filename_text: string;
  s3_key_text: string;
  size_number: number;
  "Created Date": string;
  "Modified Date": string;
  user_id_text: string;
};

type Analysis = {
  records: number;
  uniqueIds: number;
  duplicateIds: number;
  verified: number;
  failed: number;
  changed: number;
  missing: number;
  actionableIds: string[];
};

type MigrationProgress = {
  total: number;
  completed: number;
  uploaded: number;
  deduplicated: number;
  failed: number;
};

const ANALYZE_BATCH_SIZE = 400;
const MIGRATION_CONCURRENCY = 3;

function parseInventory(text: string) {
  const payload = JSON.parse(text) as {
    response?: { results?: unknown };
  };
  if (!Array.isArray(payload.response?.results)) {
    throw new Error("JSON must contain response.results.");
  }
  const requiredText = [
    "_id",
    "app_version_text",
    "appname_text",
    "content_type_text",
    "filename_text",
    "s3_key_text",
    "Created Date",
    "Modified Date",
    "user_id_text",
  ] as const;
  return payload.response.results.map((value, index) => {
    if (!value || typeof value !== "object") {
      throw new Error(`Record ${index + 1} is not an object.`);
    }
    const record = value as Record<string, unknown>;
    for (const field of requiredText) {
      if (typeof record[field] !== "string" || !record[field]) {
        throw new Error(`Record ${index + 1} is missing ${field}.`);
      }
    }
    if (
      typeof record.size_number !== "number" ||
      !Number.isSafeInteger(record.size_number) ||
      record.size_number < 0
    ) {
      throw new Error(`Record ${index + 1} has an invalid size.`);
    }
    return record as UploadedFileRecord;
  });
}

export function FileMigrationPage({
  isSuperAdmin,
}: {
  isSuperAdmin: boolean;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [privateOnly, setPrivateOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [inventoryFile, setInventoryFile] = useState<File>();
  const [inventory, setInventory] = useState<UploadedFileRecord[]>([]);
  const [analysis, setAnalysis] = useState<Analysis>();
  const [progress, setProgress] = useState<MigrationProgress>();
  const [busy, setBusy] = useState<"analyze" | "migrate">();
  const [error, setError] = useState<string>();
  const rows = useMemo(
    () =>
      fileStatus.safeSamples.filter(
        (row) =>
          (type === "all" || row.type.toLowerCase() === type) &&
          (!privateOnly || row.private) &&
          `${row.fileName} ${row.attachedTo} ${row.status}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [privateOnly, search, type],
  );
  const pageSize = fileStatus.pageSize;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  function resetPage() {
    setPage(1);
  }

  async function analyzeInventory() {
    if (!inventoryFile || !isSuperAdmin) return;
    setBusy("analyze");
    setError(undefined);
    setProgress(undefined);
    try {
      const records = parseInventory(await inventoryFile.text());
      const unique = new Map(records.map((record) => [record._id, record]));
      const uniqueRecords = [...unique.values()];
      const combined: Analysis = {
        records: records.length,
        uniqueIds: uniqueRecords.length,
        duplicateIds: records.length - uniqueRecords.length,
        verified: 0,
        failed: 0,
        changed: 0,
        missing: 0,
        actionableIds: [],
      };
      for (
        let offset = 0;
        offset < uniqueRecords.length;
        offset += ANALYZE_BATCH_SIZE
      ) {
        const { data, error: invokeError } = await supabase.functions.invoke(
          "attachment-incremental",
          {
            body: {
              action: "analyze",
              records: uniqueRecords.slice(
                offset,
                offset + ANALYZE_BATCH_SIZE,
              ),
            },
          },
        );
        if (invokeError) throw invokeError;
        const result = data as Analysis;
        combined.verified += result.verified;
        combined.failed += result.failed;
        combined.changed += result.changed;
        combined.missing += result.missing;
        combined.actionableIds.push(...result.actionableIds);
      }
      setInventory(uniqueRecords);
      setAnalysis(combined);
    } catch (analysisError) {
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : t("fileMigration.incrementalPanel.analyzeError"),
      );
    } finally {
      setBusy(undefined);
    }
  }

  async function runIncremental() {
    if (!analysis || !isSuperAdmin || busy) return;
    const actionable = new Set(analysis.actionableIds);
    const queue = inventory.filter((record) => actionable.has(record._id));
    let cursor = 0;
    const nextProgress: MigrationProgress = {
      total: queue.length,
      completed: 0,
      uploaded: 0,
      deduplicated: 0,
      failed: 0,
    };
    setBusy("migrate");
    setError(undefined);
    setProgress({ ...nextProgress });

    async function worker() {
      while (cursor < queue.length) {
        const record = queue[cursor];
        cursor += 1;
        const { data, error: invokeError } = await supabase.functions.invoke(
          "attachment-incremental",
          { body: { action: "migrate", record } },
        );
        nextProgress.completed += 1;
        if (invokeError) nextProgress.failed += 1;
        else if (data?.status === "uploaded") nextProgress.uploaded += 1;
        else if (data?.status === "deduplicated") {
          nextProgress.deduplicated += 1;
        }
        setProgress({ ...nextProgress });
      }
    }

    try {
      await Promise.all(
        Array.from(
          { length: Math.min(MIGRATION_CONCURRENCY, queue.length || 1) },
          () => worker(),
        ),
      );
      if (nextProgress.failed) {
        setError(
          t("fileMigration.incrementalPanel.partialFailure", {
            count: nextProgress.failed,
          }),
        );
      }
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div className="migration-page file-migration-page">
      <section className="migration-hero">
        <div>
          <span className="eyebrow">{t("fileMigration.eyebrow")}</span>
          <h1>{t("fileMigration.title")}</h1>
          <p>{t("fileMigration.description")}</p>
        </div>
      </section>

      <section className="panel attachment-incremental-panel">
        <header>
          <div>
            <span className="eyebrow">
              {t("fileMigration.incrementalPanel.eyebrow")}
            </span>
            <h2>{t("fileMigration.incrementalPanel.title")}</h2>
            <p>{t("fileMigration.incrementalPanel.description")}</p>
          </div>
          <span
            className={`status-badge ${isSuperAdmin ? "green" : "amber"}`}
          >
            {isSuperAdmin
              ? t("fileMigration.incrementalPanel.authorized")
              : t("fileMigration.incrementalPanel.superAdminRequired")}
          </span>
        </header>

        <div className="attachment-upload-row">
          <label className="attachment-json-input">
            <Upload aria-hidden="true" />
            <span>
              <strong>
                {inventoryFile?.name ??
                  t("fileMigration.incrementalPanel.selectJson")}
              </strong>
              <small>
                {inventoryFile
                  ? `${(inventoryFile.size / 1024).toFixed(1)} KB`
                  : t("fileMigration.incrementalPanel.jsonHint")}
              </small>
            </span>
            <input
              type="file"
              accept="application/json,.json"
              disabled={!isSuperAdmin || Boolean(busy)}
              onChange={(event) => {
                setInventoryFile(event.target.files?.[0]);
                setAnalysis(undefined);
                setProgress(undefined);
                setError(undefined);
              }}
            />
          </label>
          <Button
            onClick={() => void analyzeInventory()}
            disabled={!isSuperAdmin || !inventoryFile || Boolean(busy)}
          >
            {busy === "analyze" ? (
              <LoaderCircle className="spin" />
            ) : (
              <Search />
            )}
            {t("fileMigration.incrementalPanel.analyze")}
          </Button>
          <Button
            onClick={() => void runIncremental()}
            disabled={
              !isSuperAdmin ||
              !analysis?.actionableIds.length ||
              Boolean(busy)
            }
          >
            {busy === "migrate" ? (
              <LoaderCircle className="spin" />
            ) : (
              <Play />
            )}
            {busy === "migrate"
              ? t("fileMigration.incrementalPanel.running")
              : t("fileMigration.incremental")}
          </Button>
        </div>

        {error && (
          <div className="attachment-migration-error" role="alert">
            <AlertTriangle />
            <span>{error}</span>
          </div>
        )}

        {analysis && (
          <div className="attachment-analysis-grid">
            <article>
              <span>{t("fileMigration.incrementalPanel.records")}</span>
              <strong>{analysis.records.toLocaleString()}</strong>
            </article>
            <article>
              <span>{t("fileMigration.incrementalPanel.existing")}</span>
              <strong>{analysis.verified.toLocaleString()}</strong>
            </article>
            <article>
              <span>{t("fileMigration.incrementalPanel.new")}</span>
              <strong>{analysis.missing.toLocaleString()}</strong>
            </article>
            <article>
              <span>{t("fileMigration.incrementalPanel.retry")}</span>
              <strong>{analysis.failed.toLocaleString()}</strong>
            </article>
            <article>
              <span>{t("fileMigration.incrementalPanel.changed")}</span>
              <strong>{analysis.changed.toLocaleString()}</strong>
            </article>
            <article>
              <span>{t("fileMigration.incrementalPanel.jsonDuplicates")}</span>
              <strong>{analysis.duplicateIds.toLocaleString()}</strong>
            </article>
          </div>
        )}

        {progress && (
          <div className="attachment-progress">
            <div>
              <span>
                {progress.completed.toLocaleString()} /{" "}
                {progress.total.toLocaleString()}
              </span>
              <strong>
                {progress.total
                  ? Math.round((progress.completed / progress.total) * 100)
                  : 100}
                %
              </strong>
            </div>
            <div className="attachment-progress-track">
              <span
                style={{
                  width: `${
                    progress.total
                      ? (progress.completed / progress.total) * 100
                      : 100
                  }%`,
                }}
              />
            </div>
            <p>
              <CheckCircle2 />
              {t("fileMigration.incrementalPanel.result", {
                uploaded: progress.uploaded,
                deduplicated: progress.deduplicated,
                failed: progress.failed,
              })}
            </p>
          </div>
        )}
      </section>

      <section className="file-migration-metrics">
        <article className="panel">
          <span>{t("fileMigration.expected")}</span>
          <strong>{fileStatus.expectedFiles.toLocaleString()}</strong>
        </article>
        <article className="panel">
          <span>{t("fileMigration.discovered")}</span>
          <strong>{fileStatus.uniqueFiles.toLocaleString()}</strong>
        </article>
        <article className="panel warning">
          <span>{t("fileMigration.missing")}</span>
          <strong>{fileStatus.discoveryGap.toLocaleString()}</strong>
        </article>
        <article className="panel warning">
          <span>{t("fileMigration.binary")}</span>
          <strong>{fileStatus.binaryMigrated.toLocaleString()}</strong>
        </article>
        <article className="panel warning">
          <span>{t("fileMigration.checksum")}</span>
          <strong>{fileStatus.checksumVerified.toLocaleString()}</strong>
        </article>
      </section>

      <section className="file-inventory-gate" role="alert">
        <AlertTriangle />
        <div>
          <strong>{t("fileMigration.gateTitle")}</strong>
          <p>{t("fileMigration.gateDescription")}</p>
        </div>
        <Button disabled>
          <FileArchive />
          {t("fileMigration.incremental")}
        </Button>
      </section>

      <section className="panel file-manager-panel">
        <header className="file-manager-heading">
          <div>
            <h2>{t("fileMigration.managerTitle")}</h2>
            <p>{t("fileMigration.sampleNotice")}</p>
          </div>
          <code>{fileStatus.incrementalPolicy.filter}</code>
        </header>
        <div className="file-manager-toolbar">
          <label className="file-manager-search">
            <span>{t("fileMigration.search")}</span>
            <div>
              <Search aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetPage();
                }}
                placeholder={t("fileMigration.searchPlaceholder")}
              />
            </div>
          </label>
          <label>
            <span>{t("fileMigration.fileType")}</span>
            <select
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                resetPage();
              }}
            >
              <option value="all">{t("fileMigration.allTypes")}</option>
              <option value="document">{t("fileMigration.document")}</option>
              <option value="image">{t("fileMigration.image")}</option>
            </select>
          </label>
          <label className="file-private-filter">
            <input
              type="checkbox"
              checked={privateOnly}
              onChange={(event) => {
                setPrivateOnly(event.target.checked);
                resetPage();
              }}
            />
            {t("fileMigration.privateOnly")}
          </label>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("fileMigration.columns.name")}</th>
                <th>{t("fileMigration.columns.size")}</th>
                <th>{t("fileMigration.columns.type")}</th>
                <th>{t("fileMigration.columns.uploadDate")}</th>
                <th>{t("fileMigration.columns.user")}</th>
                <th>{t("fileMigration.columns.attached")}</th>
                <th>{t("fileMigration.columns.status")}</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.sampleId}>
                  <td><strong>{row.fileName}</strong></td>
                  <td>{row.size ?? "—"}</td>
                  <td>{row.type}</td>
                  <td>{row.uploadDate ?? "—"}</td>
                  <td><code>{row.userId}</code></td>
                  <td><code>{row.attachedTo}</code></td>
                  <td><span className="status-badge amber">{row.status}</span></td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="file-manager-empty">
                    {t("fileMigration.noSamples")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="file-manager-pagination">
          <span>
            {t("fileMigration.pagination", {
              count: rows.length,
              size: pageSize,
            })}
          </span>
          <div>
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((current) => current - 1)}
              aria-label={t("fileMigration.previous")}
            >
              <ChevronLeft />
            </Button>
            <strong>{page} / {pageCount}</strong>
            <Button
              variant="outline"
              disabled={page === pageCount}
              onClick={() => setPage((current) => current + 1)}
              aria-label={t("fileMigration.next")}
            >
              <ChevronRight />
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}
