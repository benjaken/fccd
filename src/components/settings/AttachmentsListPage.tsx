import { useCallback, useEffect, useState } from "react";
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
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import {
  ATTACHMENT_FILE_TYPES,
  attachmentFileType,
  attachmentFileTypeLabelKey,
  createAttachmentUrl,
  fetchAttachments,
  SETTINGS_PAGE_SIZE,
  type AttachmentListItem,
} from "@/lib/settings";

type AttachmentsLoader = typeof fetchAttachments;

const ATTACHMENT_SKELETON_COLUMNS = [
  { width: "72%" },
  { width: "5.5rem" },
  { width: "4.5rem" },
  { width: "7rem" },
];

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
  const [fileType, setFileType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
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
      const result = await loadAttachments({
        page,
        search,
        status: "",
        fileType,
        startDate,
        endDate,
      });
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
  }, [endDate, fileType, loadAttachments, page, reloadKey, search, startDate]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const submitSearch = () => {
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
        <header className="orders-toolbar settings-attachments-toolbar">
          <ListSearchBar
            id="settings-attachments-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={submitSearch}
            label={t("settings.attachments.search")}
            placeholder={t("settings.attachments.searchPlaceholder")}
            submitLabel={t("settings.attachments.searchAction")}
            filtersActive={Boolean(fileType || startDate || endDate)}
            filters={
              <div className="settings-attachments-filters">
                <label className="orders-status-filter">
                  <span>{t("settings.attachments.fileTypeFilter")}</span>
                  <select
                    value={fileType}
                    onChange={(event) => {
                      setPage(1);
                      setFileType(event.target.value);
                    }}
                  >
                    <option value="">
                      {t("settings.attachments.allFileTypes")}
                    </option>
                    {ATTACHMENT_FILE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(attachmentFileTypeLabelKey(type))}
                      </option>
                    ))}
                  </select>
                </label>

                <DateRangePicker
                  startId="settings-attachments-start-date"
                  endId="settings-attachments-end-date"
                  startValue={startDate}
                  endValue={endDate}
                  onStartChange={(value) => {
                    setPage(1);
                    setStartDate(value);
                  }}
                  onEndChange={(value) => {
                    setPage(1);
                    setEndDate(value);
                  }}
                  startLabel={t("settings.attachments.startDate")}
                  endLabel={t("settings.attachments.endDate")}
                  legend={t("settings.attachments.dateRange")}
                />
              </div>
            }
          />
        </header>

        {error ? (
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
        ) : !loading && items.length === 0 ? (
          <div className="orders-state">
            <FileArchive />
            <div>
              <strong>{t("settings.attachments.empty")}</strong>
              <span>{t("settings.attachments.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <ListTable
            className="orders-table-wrap settings-attachments-table"
            loading={loading}
            loadingLabel={t("settings.attachments.loading")}
            skeletonRows={SETTINGS_PAGE_SIZE}
            skeletonColumns={ATTACHMENT_SKELETON_COLUMNS}
            header={
              <tr>
                <th>{t("settings.attachments.columns.file")}</th>
                <th>{t("settings.attachments.columns.type")}</th>
                <th>{t("settings.attachments.columns.size")}</th>
                <th>{t("settings.attachments.columns.updated")}</th>
              </tr>
            }
          >
            {items.map((attachment) => {
              const Icon = attachmentFileIcon(attachment);
              const label =
                attachment.originalFilename || t("common.notSet");
              const canOpen = Boolean(attachment.objectPath);
              const type = attachmentFileType(attachment);
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
                  <td>{t(attachmentFileTypeLabelKey(type))}</td>
                  <td>{formatSize(attachment.sizeBytes)}</td>
                  <td>
                    {date.format(
                      new Date(
                        attachment.sourceModifiedAt || attachment.updatedAt,
                      ),
                    )}
                  </td>
                </tr>
              );
            })}
          </ListTable>
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
