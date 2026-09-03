import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { ListTable } from "@/components/ui/list-table";
import { DetailLink } from "@/components/ui/detail-link";
import {
  createEnquiryForm,
  fetchEnquiryForms,
  type EnquiryFormListItem,
} from "@/lib/enquiry-forms-api";

import "./enquiry-form.css";

function statusLabel(status: EnquiryFormListItem["status"]) {
  if (status === "published") return "已發佈";
  if (status === "disabled") return "已停用";
  return "草稿";
}

export function EnquiryFormsListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<EnquiryFormListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const nav = searchParams.get("nav");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchEnquiryForms());
    } catch {
      setError("無法載入表單列表");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) =>
      [item.internalName, item.publicTitle, item.slug].some((value) =>
        value.toLowerCase().includes(keyword),
      ),
    );
  }, [items, search]);

  const editTo = (id: string) =>
    `/quotes/enquiry-forms/${id}/edit${nav ? `?nav=${encodeURIComponent(nav)}` : ""}`;

  return (
    <section className="enquiry-builder-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">到會 · 報價單</span>
          <h1>Enquiry 表單</h1>
          <p>維護公開查詢表單。第一份預設表單已對照現行 EmailMeForm。</p>
        </div>
        <Button
          type="button"
          onClick={async () => {
            const id = await createEnquiryForm({ internalName: "未命名表單", publicTitle: "未命名表單" });
            navigate(editTo(id));
          }}
        >
          新增表單
        </Button>
      </header>

      <SearchField
        id="enquiry-forms-search"
        value={search}
        onChange={setSearch}
        placeholder="搜尋標題或 slug"
        label="搜尋表單"
      />
      {error ? <p role="alert">{error}</p> : null}
      <ListTable
        loading={loading}
        loadingLabel="載入表單"
        skeletonColumns={6}
        header={
          <tr>
            <th>內部名稱</th>
            <th>公開標題</th>
            <th>狀態</th>
            <th>題目</th>
            <th>公開連結</th>
            <th>更新</th>
          </tr>
        }
      >
        {visible.map((item) => (
          <tr key={item.id}>
            <td>
              <DetailLink to={editTo(item.id)}>{item.internalName}</DetailLink>
            </td>
            <td>{item.publicTitle}</td>
            <td className={`enquiry-status-${item.status}`}>{statusLabel(item.status)}</td>
            <td>{item.questionCount}</td>
            <td>
              {item.status === "published" ? (
                <Link to={item.isDefault ? "/quote-inquiry" : `/quote-inquiry/${item.slug}`} target="_blank" rel="noopener noreferrer">
                  /quote-inquiry{item.isDefault ? "" : `/${item.slug}`}
                </Link>
              ) : "—"}
            </td>
            <td>{new Date(item.updatedAt).toLocaleString("zh-HK")}</td>
          </tr>
        ))}
      </ListTable>
      {!loading && visible.length === 0 ? (
        <p>尚未有表單。請新增，或確認種子表單已載入。</p>
      ) : null}
    </section>
  );
}
