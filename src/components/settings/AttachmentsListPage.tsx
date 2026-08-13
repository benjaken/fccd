import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  RefreshCw,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  createAttachmentUrl,
  fetchAttachments,
  SETTINGS_PAGE_SIZE,
  type AttachmentListItem,
} from "@/lib/settings";

type AttachmentsLoader = typeof fetchAttachments;

function attachmentFileIcon(attachment: AttachmentListItem) {
  const mime = (attachment.mimeType ?? "").toLowerCase();
  const name = (attachment.originalFilename ?? "").toLowerCase();

  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp)$/.test(name)) {
    return FileImage;
  }
  if (mime.startsWith("video/") || /\.(mp4|mov|webm|avi|mkv)$/.test(name)) {
    return FileVideo;
  }
  if (mime.startsWith("audio/") || /\.(mp3|wav|aac|m4a|ogg)$/.test(name)) {
    return FileAudio;
  }
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime === "text/csv" ||
    /\.(xlsx?|csv|ods)$/.test(name)
  ) {
    return FileSpreadsheet;
  }
  if (
    mime.includes("zip") ||
    mime.includes("compressed") ||
    mime.includes("rar") ||
    /\.(zip|rar|7z|tar|gz)$/.test(name)
  ) {
    return FileArchive;
  }
  if (
    mime.includes("pdf") ||
    mime.startsWith("text/") ||
    mime.includes("word") ||
    mime.includes("document") ||
    /\.(pdf|docx?|txt|rtf|md)$/.test(name)
  ) {
    return FileText;
  }
  return File;
}

export function AttachmentsListPage({
  loadAttachments = fetchAttachments,
  getAttachmentUrl = createAttachmentUrl,
}: {
  loadAttachments?: AttachmentsLoader;
  getAttachmentUrl?: typeof createAttachmentUrl;
}) {
  const { t, i18n } = useTranslation();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AttachmentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / SETTINGS_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (page - 1) * SETTINGS_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * SETTINGS_PAGE_SIZE, total);
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  });

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadAttachments({ page, search, status: "" });
      setItems(result.items);
      setTotal(result.total);
    } catch (loadError) {
      const code =
        typeof loadError === "object" &&
        loadError &&
        "code" in loadError &&
        typeof loadError.code === "string"
          ? loadError.code
          : "attachments_load_failed";
      setItems([]);
      setTotal(0);
      setError(code);
    } finally {
      setLoading(false);
    }
  }, [loadAttachments, page, reloadKey, search]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
  };

  const formatSize = (value: number | null) => {
    if (value === null) return t("common.notSet");
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  };

  const openAttachment = async (attachment: AttachmentListItem) => {
    if (!attachment.objectPath || openingId === attachment.id) return;
    setOpeningId(attachment.id);
    setError(null);
    try {
      const signedUrl = await getAttachmentUrl(attachment);
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (openError) {
      const code =
        typeof openError === "object" &&
        openError &&
        "message" in openError &&
        typeof openError.message === "string"
          ? openError.message
          : "attachment_open_failed";
      setError(code);
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <section className="orders-page settings-list-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">{t("settings.eyebrow")}</span>
          <h1>{t("settings.attachments.title")}</h1>
        </div>
      </header>

      <article className="panel orders-panel">
        <header className="orders-toolbar">
          <form className="orders-search" onSubmit={submitSearch}>
            <label
              className="orders-search-field"
              htmlFor="settings-attachments-search"
            >
              <Search aria-hidden="true" />
              <span className="sr-only">
                {t("settings.attachments.search")}
              </span>
              <input
                id="settings-attachments-search"
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
                placeholder={t("settings.attachments.searchPlaceholder")}
              />
            </label>
            <Button type="submit" variant="outline">
              {t("settings.attachments.searchAction")}
            </Button>
          </form>
        </header>

        {loading ? (
          <div className="orders-state" role="status">
            <RefreshCw className="spin" />
            <span>{t("settings.attachments.loading")}</span>
          </div>
        ) : error ? (
          <div className="orders-state orders-state-error" role="alert">
            <FileArchive />
            <div>
              <strong>{t("settings.attachments.loadError")}</strong>
              <span>{t("settings.attachments.loadErrorDescription")}</span>
            </div>
            <Button
              variant="outline"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              <RefreshCw />
              {t("settings.retry")}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="orders-state">
            <FileArchive />
            <div>
              <strong>{t("settings.attachments.empty")}</strong>
              <span>{t("settings.attachments.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <div className="table-wrap orders-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("settings.attachments.columns.file")}</th>
                  <th>{t("settings.attachments.columns.size")}</th>
                  <th>{t("settings.attachments.columns.updated")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((attachment) => {
                  const Icon = attachmentFileIcon(attachment);
                  const label =
                    attachment.originalFilename || t("common.notSet");
                  const canOpen = Boolean(attachment.objectPath);
                  return (
                    <tr key={attachment.id}>
                      <td>
                        <div className="settings-attachment-file">
                          <span
                            className="settings-attachment-file-icon"
                            aria-hidden="true"
                          >
                            {openingId === attachment.id ? (
                              <RefreshCw className="spin" />
                            ) : (
                              <Icon />
                            )}
                          </span>
                          {canOpen ? (
                            <button
                              type="button"
                              className="settings-attachment-file-link"
                              onClick={() => void openAttachment(attachment)}
                              disabled={openingId === attachment.id}
                            >
                              {label}
                            </button>
                          ) : (
                            <span className="settings-attachment-file-muted">
                              {label}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>{formatSize(attachment.sizeBytes)}</td>
                      <td>
                        {date.format(
                          new Date(
                            attachment.sourceModifiedAt ||
                              attachment.updatedAt,
                          ),
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <footer className="orders-pagination">
          <span>
            {t("settings.pagination", {
              from: visibleFrom,
              to: visibleTo,
              total,
            })}
          </span>
          <div>
            <Button
              variant="outline"
              size="icon"
              disabled={loading || page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              aria-label={t("settings.previous")}
            >
              <ChevronLeft />
            </Button>
            <strong>
              {page} / {totalPages}
            </strong>
            <Button
              variant="outline"
              size="icon"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              aria-label={t("settings.next")}
            >
              <ChevronRight />
            </Button>
          </div>
        </footer>
      </article>
    </section>
  );
}
