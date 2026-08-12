import { AlertTriangle, CheckCircle2, FileArchive, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import fileStatus from "@/data/file-migration-status.generated.json";

export function FileMigrationPage() {
  const { t } = useTranslation();
  const discoveredRate = fileStatus.uniqueFiles / fileStatus.ownerEstimatedMinimum;
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
          <span>{t("fileMigration.ownerEstimate")}</span>
          <strong>{fileStatus.ownerEstimatedMinimum.toLocaleString()}+</strong>
        </article>
        <article className="panel">
          <span>{t("fileMigration.discovered")}</span>
          <strong>{fileStatus.uniqueFiles.toLocaleString()}</strong>
          <small>{(discoveredRate * 100).toFixed(1)}%</small>
        </article>
        <article className="panel success">
          <span>{t("fileMigration.metadata")}</span>
          <strong>{fileStatus.metadataMigrated.toLocaleString()}</strong>
          <CheckCircle2 />
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
      <section className="panel file-incremental-policy">
        <header>
          <div>
            <RefreshCw />
            <div>
              <h2>{t("fileMigration.incrementalTitle")}</h2>
              <p>{t("fileMigration.incrementalDescription")}</p>
            </div>
          </div>
        </header>
        <dl>
          <div><dt>{t("fileMigration.filter")}</dt><dd><code>{fileStatus.incrementalPolicy.filter}</code></dd></div>
          <div><dt>{t("fileMigration.dedupe")}</dt><dd><code>{fileStatus.incrementalPolicy.dedupeKey}</code></dd></div>
          <div><dt>{t("fileMigration.batch")}</dt><dd>{fileStatus.incrementalPolicy.batchSize}</dd></div>
          <div><dt>{t("fileMigration.resume")}</dt><dd>{t("fileMigration.enabled")}</dd></div>
        </dl>
        <Button disabled>
          <FileArchive />
          {t("fileMigration.start")}
        </Button>
        <p><AlertTriangle />{t("fileMigration.finalPhaseLock")}</p>
      </section>
      <section className="panel file-field-breakdown">
        <header><h2>{t("fileMigration.breakdown")}</h2></header>
        <div>
          {fileStatus.byField.slice(0, 20).map((item) => (
            <article key={item.field}>
              <code>{item.field}</code>
              <strong>{item.count.toLocaleString()}</strong>
            </article>
          ))}
        </div>
      </section>
      <section className="file-discovery-warning">
        <AlertTriangle />
        {t("fileMigration.discoveryGap", {
          count: fileStatus.discoveryGapMinimum.toLocaleString(),
        })}
      </section>
    </div>
  );
}
