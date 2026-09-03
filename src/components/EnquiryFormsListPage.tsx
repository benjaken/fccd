import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { DetailLink } from "@/components/ui/detail-link";
import { ListTable } from "@/components/ui/list-table";
import { OperationalListState } from "@/components/ui/operational-list-state";
import { SearchField } from "@/components/ui/search-field";
import {
  createEnquiryForm,
  fetchEnquiryForms,
  type EnquiryFormListItem,
} from "@/lib/enquiry-forms-api";

import "./enquiry-form.css";

const FORM_SKELETON_COLUMNS = [
  { width: "12rem" },
  { width: "22%" },
  { width: "5rem", variant: "badge" as const },
  { width: "4rem" },
  { width: "12rem" },
  { width: "10rem" },
];

function statusLabel(status: EnquiryFormListItem["status"]) {
  if (status === "published") return "已發佈";
  if (status === "disabled") return "已停用";
  return "草稿";
}

export function EnquiryFormsListPage({
  loadForms = fetchEnquiryForms,
  createForm = createEnquiryForm,
}: {
  loadForms?: () => Promise<EnquiryFormListItem[]>;
  createForm?: typeof createEnquiryForm;
} = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<EnquiryFormListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const nav = searchParams.get("nav");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await loadForms());
    } catch {
      setItems([]);
      setError("無法載入表單列表");
    } finally {
      setLoading(false);
    }
  }, [loadForms, reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

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
    <section className="orders-page enquiry-builder-page">
      <header className="page-heading orders-heading">
        <div>
          <span className="eyebrow">到會 · 報價單</span>
          <h1>Enquiry 表單</h1>
          <p>維護公開查詢表單。第一份預設表單已對照現行 EmailMeForm。</p>
        </div>
        <Button
          type="button"
          disabled={creating}
          onClick={async () => {
            setCreating(true);
            try {
              const id = await createForm({ internalName: "未命名表單", publicTitle: "未命名表單" });
              navigate(editTo(id));
            } catch {
              setError("無法新增表單");
            } finally {
              setCreating(false);
            }
          }}
        >
          新增表單
        </Button>
      </header>

      <article className="panel orders-panel">
        <header className="orders-toolbar">
          <SearchField
            id="enquiry-forms-search"
            value={search}
            onChange={setSearch}
            placeholder={t("quotes.enquiryFormsSearchPlaceholder")}
            label="搜尋表單"
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
        ) : !loading && visible.length === 0 ? (
          <OperationalListState
            icon={FileText}
            title={items.length === 0 ? "尚未有表單" : "沒有符合的表單"}
            description={items.length === 0 ? "請新增，或確認種子表單已載入。" : "請改用其他關鍵字搜尋。"}
          />
        ) : (
          <ListTable
            className="quotes-table-wrap"
            onRefresh={() => setReloadKey((key) => key + 1)}
            loading={loading}
            loadingLabel="載入表單"
            skeletonColumns={FORM_SKELETON_COLUMNS}
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
        )}
      </article>
    </section>
  );
}
