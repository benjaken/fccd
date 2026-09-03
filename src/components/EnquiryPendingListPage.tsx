import { useCallback, useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { DetailLink } from "@/components/ui/detail-link";
import { ListTable } from "@/components/ui/list-table";
import { OperationalListState } from "@/components/ui/operational-list-state";
import { SearchField } from "@/components/ui/search-field";
import {
  fetchPendingEnquirySubmissions,
  type EnquirySubmissionListItem,
} from "@/lib/enquiry-forms-api";

import "./enquiry-form.css";

const PENDING_SKELETON_COLUMNS = [
  { width: "10rem" },
  { width: "16rem" },
  { width: "8rem" },
  { width: "22%" },
  { width: "4rem" },
  { width: "6rem" },
  { width: "6rem" },
  { width: "6rem" },
];

function dash(value: string) {
  return value.trim() || "—";
}

function statusText(kind: "internal" | "ack" | "asana", value: string) {
  if (kind === "internal") {
    if (value === "sent") return "已通知";
    if (value === "failed") return "通知失敗";
    return "尚未通知";
  }
  if (kind === "ack") {
    if (value === "sent") return "已寄出";
    if (value === "failed") return "失敗";
    if (value === "no_email") return "無電郵";
    return "尚未寄出";
  }
  if (value === "created") return "已建立";
  if (value === "failed") return "失敗";
  return "尚未建立";
}

export function EnquiryPendingListPage({
  loadSubmissions = fetchPendingEnquirySubmissions,
}: {
  loadSubmissions?: (search?: string) => Promise<EnquirySubmissionListItem[]>;
} = {}) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<EnquirySubmissionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const nav = searchParams.get("nav");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await loadSubmissions(search));
    } catch {
      setItems([]);
      setError("無法載入待報價");
    } finally {
      setLoading(false);
    }
  }, [loadSubmissions, reloadKey, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="orders-page enquiry-pending-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">到會 · 報價單</span>
          <h1>待報價</h1>
          <p>公開 Enquiry Form 提交、尚未轉成報價單的查詢。</p>
        </div>
      </header>
      <article className="panel orders-panel">
        <header className="orders-toolbar">
          <SearchField
            id="enquiry-pending-search"
            value={search}
            onChange={setSearch}
            placeholder={t("quotes.pendingSearchPlaceholder")}
            label="搜尋待報價"
          />
        </header>
        {error ? (
          <OperationalListState
            icon={FileText}
            title={error}
            description="請稍後再試，或重新整理列表。"
            retryLabel="重試"
            onRetry={() => setReloadKey((key) => key + 1)}
          />
        ) : !loading && items.length === 0 ? (
          <OperationalListState
            icon={FileText}
            title="暫無待報價查詢"
            description={search.trim() ? "請改用其他關鍵字搜尋。" : "公開表單提交後會出現在這裡。"}
          />
        ) : (
          <ListTable
            className="quotes-table-wrap"
            onRefresh={() => setReloadKey((key) => key + 1)}
            loading={loading}
            loadingLabel="載入待報價"
            skeletonColumns={PENDING_SKELETON_COLUMNS}
            header={
              <tr>
                <th>建立時間</th>
                <th>客戶</th>
                <th>日期</th>
                <th>描述</th>
                <th>人數</th>
                <th>內部通知</th>
                <th>對客確認</th>
                <th>Asana</th>
              </tr>
            }
          >
            {items.map((item) => {
              const to = `/quotes/pending/${item.id}${nav ? `?nav=${encodeURIComponent(nav)}` : ""}`;
              return (
                <tr key={item.id}>
                  <td>
                    <DetailLink to={to}>
                      {new Date(item.createdAt).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong" })}
                    </DetailLink>
                  </td>
                  <td>
                    <div>{dash(`${item.salutation}${item.customerName}`)}</div>
                    <div>{dash(item.companyName)}</div>
                    <div>{dash(item.phone)}</div>
                    <small>{item.formTitle || "Enquiry Form"}</small>
                  </td>
                  <td>{dash(item.deliveryDateRaw)}</td>
                  <td>{dash(item.quoteDescription)}</td>
                  <td>{dash(item.headcount)}</td>
                  <td>{statusText("internal", item.internalEmailStatus)}</td>
                  <td>{statusText("ack", item.ackEmailStatus)}</td>
                  <td>
                    {item.asanaLink ? (
                      <a href={item.asanaLink} target="_blank" rel="noopener noreferrer">Asana Link</a>
                    ) : (
                      statusText("asana", item.asanaStatus)
                    )}
                  </td>
                </tr>
              );
            })}
          </ListTable>
        )}
      </article>
    </section>
  );
}
