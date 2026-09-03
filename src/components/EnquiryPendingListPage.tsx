import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { DetailLink } from "@/components/ui/detail-link";
import { ListTable } from "@/components/ui/list-table";
import { SearchField } from "@/components/ui/search-field";
import {
  fetchPendingEnquirySubmissions,
  type EnquirySubmissionListItem,
} from "@/lib/enquiry-forms-api";

import "./enquiry-form.css";

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

export function EnquiryPendingListPage() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<EnquirySubmissionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const nav = searchParams.get("nav");

  const load = async (keyword = search) => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchPendingEnquirySubmissions(keyword));
    } catch {
      setError("無法載入待報價");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load("");
  }, []);

  return (
    <section className="enquiry-pending-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">到會 · 報價單</span>
          <h1>待報價</h1>
          <p>公開 Enquiry Form 提交、尚未轉成報價單的查詢。</p>
        </div>
      </header>
      <SearchField
        id="enquiry-pending-search"
        value={search}
        onChange={(value) => {
          setSearch(value);
          void load(value);
        }}
        placeholder="姓名、公司、電話、電郵、描述"
        label="搜尋待報價"
      />
      {error ? <p role="alert">{error}</p> : null}
      <ListTable
        loading={loading}
        loadingLabel="載入待報價"
        skeletonColumns={8}
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
      {!loading && items.length === 0 ? <p>暫無待報價查詢。</p> : null}
    </section>
  );
}
