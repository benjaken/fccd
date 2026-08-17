import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Package,
  Pencil,
  RefreshCw,
  X,
} from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { DetailLink } from "@/components/ui/detail-link";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { TablePagination } from "@/components/ui/table-pagination";
import { detailFromLocation } from "@/lib/detail-navigation";
import {
  archivePackage,
  fetchPackages,
  PACKAGES_PAGE_SIZE,
  type PackageListFilters,
  type PackageListItem,
  type PackageListResult,
  type PackageSortField,
  type PackageStatusFilter,
} from "@/lib/packages";
import {
  fetchProductChannels,
  type CatalogOption,
} from "@/lib/products";
import { useDeferredFilter } from "@/lib/use-deferred-filter";

const PACKAGE_SKELETON_COLUMNS = [
  { width: "2.5rem" },
  { width: "5.5rem" },
  { width: "6rem" },
  { width: "72%" },
  { width: "6rem" },
  { width: "4rem" },
  { width: "5rem" },
  { width: "3.5rem", variant: "badge" as const },
  { width: "4.5rem", variant: "action" as const },
];

type PackagesLoader = (filters: PackageListFilters) => Promise<PackageListResult>;
type ChannelsLoader = () => Promise<CatalogOption[]>;
type PackageArchiver = (id: string) => Promise<void>;

export function PackagesListPage({
  canEdit = false,
  loadPackages = fetchPackages,
  loadChannels = fetchProductChannels,
  archiveItem = archivePackage,
}: {
  canEdit?: boolean;
  loadPackages?: PackagesLoader;
  loadChannels?: ChannelsLoader;
  archiveItem?: PackageArchiver;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [channelId, setChannelId] = useState(
    () => searchParams.get("channel") ?? "",
  );
  const [status, setStatus] = useState<PackageStatusFilter>("");
  const [sortField, setSortField] = useState<PackageSortField>("sku");
  const [sortAscending, setSortAscending] = useState(true);
  const [channels, setChannels] = useState<CatalogOption[]>([]);
  const [page, setPage] = useState(1);
  const channelFilter = useDeferredFilter(channelId, (value) => {
    setPage(1);
    setChannelId(value);
  });
  const statusFilter = useDeferredFilter(status, (value) => {
    setPage(1);
    setStatus(value);
  });
  const [items, setItems] = useState<PackageListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingArchiveId, setPendingArchiveId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PACKAGES_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (page - 1) * PACKAGES_PAGE_SIZE + 1;
  const visibleTo = Math.min(page * PACKAGES_PAGE_SIZE, total);
  const skeletonColumns = canEdit
    ? PACKAGE_SKELETON_COLUMNS
    : PACKAGE_SKELETON_COLUMNS.slice(0, -1);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "HKD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [i18n.language],
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        month: "numeric",
        day: "numeric",
        year: "numeric",
        timeZone: "Asia/Hong_Kong",
      }),
    [],
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

  useEffect(() => {
    const nextChannel = searchParams.get("channel") ?? "";
    setChannelId((current) => (current === nextChannel ? current : nextChannel));
  }, [searchParams]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (channelId) next.set("channel", channelId);
    const current = searchParams.toString();
    const upcoming = next.toString();
    if (current !== upcoming) {
      setSearchParams(next, { replace: true });
    }
  }, [channelId, searchParams, setSearchParams]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadPackages({
        page,
        search,
        channelId,
        status,
        sortField,
        sortAscending,
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
  }, [channelId, loadPackages, page, reloadKey, search, sortAscending, sortField, status]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const submitSearch = () => {
    setPage(1);
    setSearch(draftSearch.trim());
  };

  const toggleSort = (field: PackageSortField) => {
    setPage(1);
    if (sortField === field) {
      setSortAscending((current) => !current);
      return;
    }
    setSortField(field);
    setSortAscending(true);
  };

  const formatPrice = (item: PackageListItem) => {
    if (item.price === null) return t("common.notSet");
    return currencyFormatter.format(item.price);
  };

  const displayName = (item: PackageListItem) =>
    item.chineseName || item.name || t("common.notSet");

  const statusLabel = (item: PackageListItem) =>
    item.isActive ? t("packages.active") : item.status || t("packages.inactive");

  const openPackage = (packageId: string) => {
    navigate(`/products/packages/${packageId}`, {
      state: detailFromLocation(location),
    });
  };

  const handleArchive = async (item: PackageListItem) => {
    if (!canEdit || pendingArchiveId) return;
    setPendingArchiveId(item.id);
    try {
      await archiveItem(item.id);
      setItems((current) => current.filter((row) => row.id !== item.id));
      setTotal((current) => Math.max(0, current - 1));
    } finally {
      setPendingArchiveId(null);
    }
  };

  const sortIcon = (field: PackageSortField) => {
    if (sortField !== field) return null;
    return sortAscending ? <ArrowUp /> : <ArrowDown />;
  };

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
            filtersActive={Boolean(channelId) || Boolean(status)}
            onConfirmFilters={() => {
              channelFilter.confirm();
              statusFilter.confirm();
            }}
            onDismissFilters={() => {
              channelFilter.revert();
              statusFilter.revert();
            }}
            filters={
              <div className="packages-filters">
                <label className="packages-status-filter">
                  <span>{t("packages.channelFilter")}</span>
                  <select
                    value={channelFilter.value}
                    onChange={(event) => {
                      channelFilter.setValue(event.target.value);
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

                <label className="packages-status-filter">
                  <span>{t("packages.statusFilter")}</span>
                  <select
                    value={statusFilter.value}
                    onChange={(event) => {
                      statusFilter.setValue(
                        event.target.value as PackageStatusFilter,
                      );
                    }}
                  >
                    <option value="">{t("packages.allStatuses")}</option>
                    <option value="Active">{t("packages.active")}</option>
                    <option value="Inactive">{t("packages.inactive")}</option>
                  </select>
                </label>
              </div>
            }
          />
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
          <div className="packages-table-block">
            <div className="packages-result-meta">
              <strong>{t("packages.resultCount", { total })}</strong>
            </div>
            <ListTable
              className="packages-table-wrap"
              onRefresh={() => setReloadKey((key) => key + 1)}
              loading={loading}
              loadingLabel={t("packages.loading")}
              skeletonRows={PACKAGES_PAGE_SIZE}
              skeletonColumns={skeletonColumns}
              header={
                <tr>
                  <th aria-label={t("packages.columns.index")} />
                  <th>{t("packages.columns.channel")}</th>
                  <th>
                    <button
                      type="button"
                      className="table-sort-button"
                      onClick={() => toggleSort("sku")}
                    >
                      {t("packages.columns.sku")}
                      {sortIcon("sku")}
                    </button>
                  </th>
                  <th>{t("packages.columns.name")}</th>
                  <th>
                    <button
                      type="button"
                      className="table-sort-button"
                      onClick={() => toggleSort("createdAt")}
                    >
                      {t("packages.columns.created")}
                      {sortIcon("createdAt")}
                    </button>
                  </th>
                  <th>{t("packages.columns.categories")}</th>
                  <th>
                    <button
                      type="button"
                      className="table-sort-button"
                      onClick={() => toggleSort("price")}
                    >
                      {t("packages.columns.price")}
                      {sortIcon("price")}
                    </button>
                  </th>
                  <th>{t("packages.columns.status")}</th>
                  {canEdit ? <th>{t("packages.columns.actions")}</th> : null}
                </tr>
              }
            >
              {items.map((item, index) => (
                <tr
                  key={item.id}
                  className="table-row-clickable"
                  onClick={() => openPackage(item.id)}
                >
                  <td className="packages-index-cell">
                    {(page - 1) * PACKAGES_PAGE_SIZE + index + 1}
                  </td>
                  <td>{item.channelName || t("common.notSet")}</td>
                  <td>{item.sku || t("common.notSet")}</td>
                  <td>
                    <DetailLink
                      className="order-link package-name-link"
                      to={`/products/packages/${item.id}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <strong>{displayName(item)}</strong>
                      <ArrowRight aria-hidden="true" />
                    </DetailLink>
                  </td>
                  <td>{dateFormatter.format(new Date(item.createdAt))}</td>
                  <td>{item.choiceSetCount}</td>
                  <td>
                    <strong>{formatPrice(item)}</strong>
                  </td>
                  <td>
                    <span
                      className={`status-badge ${item.isActive ? "green" : "neutral"}`}
                    >
                      {statusLabel(item)}
                    </span>
                  </td>
                  {canEdit ? (
                    <td className="table-actions-cell">
                      <div className="table-row-actions">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/products/packages/${item.id}/edit`, {
                              state: detailFromLocation(location),
                            });
                          }}
                          aria-label={t("packages.editAction")}
                          title={t("packages.editAction")}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={pendingArchiveId === item.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleArchive(item);
                          }}
                          aria-label={t("packages.deleteAction")}
                          title={t("packages.deleteAction")}
                        >
                          <X />
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </ListTable>
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
