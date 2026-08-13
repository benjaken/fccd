import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Package, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { TablePagination } from "@/components/ui/table-pagination";
import { TableSkeletonRows } from "@/components/ui/table-skeleton";
import {
  fetchPackages,
  PACKAGES_PAGE_SIZE,
  type PackageListFilters,
  type PackageListItem,
  type PackageListResult,
} from "@/lib/packages";
import {
  fetchProductChannels,
  type CatalogOption,
} from "@/lib/products";

const PACKAGE_SKELETON_COLUMNS = [
  { width: "5.5rem" },
  { width: "72%" },
  { width: "4.5rem" },
  { width: "3rem" },
  { width: "4rem" },
  { width: "3.5rem", variant: "badge" as const },
  { width: "7rem" },
];

type PackagesLoader = (filters: PackageListFilters) => Promise<PackageListResult>;
type ChannelsLoader = () => Promise<CatalogOption[]>;

export function PackagesListPage({
  loadPackages = fetchPackages,
  loadChannels = fetchProductChannels,
}: {
  loadPackages?: PackagesLoader;
  loadChannels?: ChannelsLoader;
}) {
  const { t, i18n } = useTranslation();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [channelId, setChannelId] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [channels, setChannels] = useState<CatalogOption[]>([]);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PackageListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / PACKAGES_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (page - 1) * PACKAGES_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * PACKAGES_PAGE_SIZE, total);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        maximumFractionDigits: 0,
      }),
    [i18n.language],
  );

  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Asia/Hong_Kong",
      }),
    [i18n.language],
  );

  useEffect(() => {
    let active = true;
    void loadChannels()
      .then((options) => {
        if (active) setChannels(options);
      })
      .catch(() => {
        if (active) setChannels([]);
      });
    return () => {
      active = false;
    };
  }, [loadChannels]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadPackages({
        page,
        search,
        channelId,
        activeOnly,
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
          : "packages_load_failed";
      setItems([]);
      setTotal(0);
      setError(code);
    } finally {
      setLoading(false);
    }
  }, [activeOnly, channelId, loadPackages, page, reloadKey, search]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const submitSearch = () => {
    setPage(1);
    setSearch(draftSearch.trim());
  };

  const formatPrice = (item: PackageListItem) => {
    if (item.price === null) return t("common.notSet");
    return currencyFormatter.format(item.price);
  };

  const displayName = (item: PackageListItem) =>
    item.chineseName || item.name || t("common.notSet");

  return (
    <section className="packages-page">
      <header className="page-heading packages-heading">
        <div>
          <span className="eyebrow">{t("packages.eyebrow")}</span>
          <h1>{t("packages.title")}</h1>
        </div>
      </header>

      <article className="panel packages-panel">
        <header className="packages-toolbar">
          <ListSearchBar
            id="packages-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={submitSearch}
            label={t("packages.search")}
            placeholder={t("packages.searchPlaceholder")}
            submitLabel={t("packages.searchAction")}
          />

          <div className="packages-filters">
            <label className="packages-status-filter">
              <span>{t("packages.channelFilter")}</span>
              <select
                value={channelId}
                onChange={(event) => {
                  setPage(1);
                  setChannelId(event.target.value);
                }}
              >
                <option value="">{t("packages.allChannels")}</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="packages-active-filter">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(event) => {
                  setPage(1);
                  setActiveOnly(event.target.checked);
                }}
              />
              <span>{t("packages.activeOnly")}</span>
            </label>
          </div>
        </header>

        {error ? (
          <div className="packages-state packages-state-error" role="alert">
            <Package />
            <div>
              <strong>
                {error === "42P01"
                  ? t("packages.migrationPending")
                  : t("packages.loadError")}
              </strong>
              <span>{t("packages.loadErrorDescription")}</span>
            </div>
            <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
              <RefreshCw />
              {t("packages.retry")}
            </Button>
          </div>
        ) : !loading && items.length === 0 ? (
          <div className="packages-state packages-state-empty">
            <Package />
            <div>
              <strong>{t("packages.empty")}</strong>
              <span>{t("packages.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <div
            className="table-wrap packages-table-wrap"
            aria-busy={loading || undefined}
          >
            {loading ? (
              <span className="sr-only" role="status">
                {t("packages.loading")}
              </span>
            ) : null}
            <table>
              <thead>
                <tr>
                  <th>{t("packages.columns.sku")}</th>
                  <th>{t("packages.columns.name")}</th>
                  <th>{t("packages.columns.channel")}</th>
                  <th>{t("packages.columns.members")}</th>
                  <th>{t("packages.columns.price")}</th>
                  <th>{t("packages.columns.status")}</th>
                  <th>{t("packages.columns.updated")}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableSkeletonRows
                    rows={PACKAGES_PAGE_SIZE}
                    columns={PACKAGE_SKELETON_COLUMNS}
                  />
                ) : (
                  items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.sku || t("common.notSet")}</td>
                      <td>
                        <Link
                          className="order-link"
                          to={`/products/packages/${item.id}`}
                        >
                          <strong>{displayName(item)}</strong>
                        </Link>
                        {item.chineseName && item.name !== item.chineseName && (
                          <small className="quote-company">{item.name}</small>
                        )}
                      </td>
                      <td>{item.channelName || t("common.notSet")}</td>
                      <td>{item.memberCount}</td>
                      <td>
                        <strong>{formatPrice(item)}</strong>
                      </td>
                      <td>
                        <span
                          className={`status-badge ${
                            item.isActive ? "green" : "amber"
                          }`}
                        >
                          {item.isActive
                            ? t("packages.active")
                            : item.status || t("packages.inactive")}
                        </span>
                      </td>
                      <td>
                        {dateTimeFormatter.format(new Date(item.updatedAt))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <TablePagination
          summary={t("packages.pagination", {
            from: visibleFrom,
            to: visibleTo,
            total,
          })}
          page={page}
          totalPages={totalPages}
          loading={loading}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => current + 1)}
          onPageChange={setPage}
          previousLabel={t("packages.previous")}
          nextLabel={t("packages.next")}
          pageLabel={t("packages.pageOf")}
          jumpLabel={t("packages.jumpToPage")}
        />
      </article>
    </section>
  );
}
