import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Download,
  File,
  FileClock,
  LoaderCircle,
  RefreshCw,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import {
  createQuoteFileUrl,
  fetchQuoteFiles,
  MAX_QUOTE_FILE_SIZE,
  QUOTE_FILE_ACCEPT,
  uploadQuoteFile,
  type QuoteFile,
} from "@/lib/quote-files";
import type { QuoteListItem } from "@/lib/quotes";

type FilesLoader = typeof fetchQuoteFiles;
type FileUploader = typeof uploadQuoteFile;
type FileUrlCreator = typeof createQuoteFileUrl;

export function QuoteFilesSidePanel({
  quote,
  onClose,
  loadFiles = fetchQuoteFiles,
  uploadFile = uploadQuoteFile,
  createFileUrl = createQuoteFileUrl,
}: {
  quote: QuoteListItem | null;
  onClose: () => void;
  loadFiles?: FilesLoader;
  uploadFile?: FileUploader;
  createFileUrl?: FileUrlCreator;
}) {
  const { t, i18n } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<QuoteFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!quote) return;
    setLoading(true);
    setError(null);
    try {
      setFiles(await loadFiles(quote.id));
    } catch {
      setFiles([]);
      setError("load");
    } finally {
      setLoading(false);
    }
  }, [loadFiles, quote]);

  useEffect(() => {
    setFiles([]);
    if (quote) void load();
  }, [load, quote]);

  const selectFile = async (file?: File) => {
    if (!quote || !file) return;
    if (file.size > MAX_QUOTE_FILE_SIZE) {
      setError("size");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadFile(quote.id, file);
      await load();
    } catch {
      setError("upload");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const openFile = async (file: QuoteFile) => {
    if (!file.available) return;
    setOpeningId(file.id);
    setError(null);
    try {
      const url = await createFileUrl(file);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError("open");
    } finally {
      setOpeningId(null);
    }
  };

  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  });
  const size = (value: number | null) => {
    if (value === null) return null;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <SidePanel
      open={Boolean(quote)}
      title={t("quotes.files.title")}
      description={t("quotes.files.description", {
        number: quote?.orderNumber || quote?.id || "",
      })}
      closeLabel={t("quotes.files.close")}
      onClose={onClose}
      className="quote-files-panel"
    >
      <section className="quote-file-upload-card">
        <div>
          <span className="quote-file-upload-icon"><Upload /></span>
          <strong>{t("quotes.files.uploadTitle")}</strong>
          <p>{t("quotes.files.uploadHint")}</p>
        </div>
        <Button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <LoaderCircle className="spin" /> : <Upload />}
          {uploading
            ? t("quotes.files.uploading")
            : t("quotes.files.chooseFile")}
        </Button>
        <input
          ref={inputRef}
          className="quote-file-input"
          type="file"
          accept={QUOTE_FILE_ACCEPT}
          aria-label={t("quotes.files.chooseFile")}
          onChange={(event) => void selectFile(event.target.files?.[0])}
        />
      </section>

      {error && (
        <div className="quote-file-error" role="alert">
          <span>
            {t(
              error === "size"
                ? "quotes.files.sizeError"
                : error === "load"
                  ? "quotes.files.loadError"
                  : error === "open"
                    ? "quotes.files.openError"
                    : "quotes.files.uploadError",
            )}
          </span>
          {error === "load" && (
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw /> {t("quotes.files.retry")}
            </Button>
          )}
        </div>
      )}

      <section className="quote-file-history" aria-busy={loading}>
        <header>
          <div>
            <FileClock />
            <h3>{t("quotes.files.history")}</h3>
          </div>
          {!loading && <span>{t("quotes.files.count", { count: files.length })}</span>}
        </header>
        {loading ? (
          <div className="quote-file-state"><LoaderCircle className="spin" /> {t("quotes.files.loading")}</div>
        ) : files.length ? (
          <ul>
            {files.map((file) => (
              <li key={file.id}>
                <span className="quote-file-type"><File /></span>
                <div>
                  <strong title={file.name}>{file.name}</strong>
                  <small>
                    {date.format(new Date(file.createdAt))}
                    {size(file.sizeBytes) ? ` · ${size(file.sizeBytes)}` : ""}
                  </small>
                  {!file.available && <em>{t("quotes.files.unavailable")}</em>}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={!file.available || openingId === file.id}
                  aria-label={t("quotes.files.open", { name: file.name })}
                  onClick={() => void openFile(file)}
                >
                  {openingId === file.id ? <LoaderCircle className="spin" /> : <Download />}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="quote-file-state quote-file-empty">
            <FileClock />
            <strong>{t("quotes.files.empty")}</strong>
            <span>{t("quotes.files.emptyDescription")}</span>
          </div>
        )}
      </section>
    </SidePanel>
  );
}
