import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileArchive,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import fileStatus from "@/data/file-migration-status.generated.json";

export function FileMigrationPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [privateOnly, setPrivateOnly] = useState(false);
  const [page, setPage] = useState(1);
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

  return (
    <div className="migration-page file-migration-page">
      <section className="migration-hero">
        <div>
          <span className="eyebrow">{t("fileMigration.eyebrow")}</span>
          <h1>{t("fileMigration.title")}</h1>
          <p>{t("fileMigration.description")}</p>
        </div>
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
