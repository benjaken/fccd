import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import { SearchX } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { OperationalListState } from "@/components/ui/operational-list-state";
import { TablePagination } from "@/components/ui/table-pagination";
import { cn } from "@/lib/utils";

export const RESTAURANT_SETTINGS_PAGE_SIZE = 15;

function searchableText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(searchableText).join(" ");
  if (!isValidElement(node)) return "";
  const props = node.props as {
    children?: ReactNode;
    value?: unknown;
    defaultValue?: unknown;
    "aria-label"?: unknown;
    placeholder?: unknown;
    title?: unknown;
    "data-search"?: unknown;
  };
  return [
    props["data-search"],
    props.value,
    props.defaultValue,
    props["aria-label"],
    props.placeholder,
    props.title,
    searchableText(props.children),
  ]
    .filter((part) => part != null && part !== "")
    .map(String)
    .join(" ");
}

export function RestaurantSettingsListTable({
  children,
  toolbarAction,
  searchable = true,
  searchPlaceholder,
  emptyTitle,
  emptyDescription,
  ...tableProps
}: {
  header: ReactNode;
  children: ReactNode;
  loading: boolean;
  loadingLabel: string;
  skeletonColumns: number;
  className?: string;
  tableClassName?: string;
  onRefresh?: () => void | Promise<void>;
  toolbarAction?: ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const { t } = useTranslation();
  const searchId = useId().replace(/:/g, "");
  const resolvedSearchPlaceholder =
    searchPlaceholder ?? t("restaurantSettingsList.searchPlaceholder");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const rows = Children.toArray(children);
  const normalizedSearch = appliedSearch.trim().toLocaleLowerCase();
  const filteredRows = normalizedSearch
    ? rows.filter((row) =>
        searchableText(row).toLocaleLowerCase().includes(normalizedSearch),
      )
    : rows;
  const total = filteredRows.length;
  const totalPages = Math.max(
    1,
    Math.ceil(total / RESTAURANT_SETTINGS_PAGE_SIZE),
  );
  const activePage = Math.min(page, totalPages);
  const visibleFrom =
    total === 0 ? 0 : (activePage - 1) * RESTAURANT_SETTINGS_PAGE_SIZE + 1;
  const visibleTo = Math.min(activePage * RESTAURANT_SETTINGS_PAGE_SIZE, total);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [appliedSearch]);

  return (
    <>
      {searchable || toolbarAction ? (
        <header className="ingredients-toolbar restaurant-settings-toolbar">
          <ListSearchBar
            id={`restaurant-settings-search-${searchId}`}
            value={search}
            onChange={setSearch}
            onSubmit={() => setAppliedSearch(search.trim())}
            label={t("restaurantSettingsList.search")}
            placeholder={resolvedSearchPlaceholder}
            disabled={tableProps.loading}
            actions={toolbarAction}
          />
        </header>
      ) : null}
      {!tableProps.loading && total === 0 && searchable ? (
        <div className="restaurant-settings-list-state">
          <OperationalListState
            icon={SearchX}
            title={
              emptyTitle ??
              t(
                normalizedSearch
                  ? "restaurantSettingsList.noResults"
                  : "restaurantSettingsList.empty",
              )
            }
            description={
              emptyDescription ??
              t(
                normalizedSearch
                  ? "restaurantSettingsList.noResultsDescription"
                  : "restaurantSettingsList.emptyDescription",
              )
            }
          />
        </div>
      ) : (
        <ListTable
          {...tableProps}
          className={cn("restaurant-settings-table-wrap", tableProps.className)}
          skeletonRows={RESTAURANT_SETTINGS_PAGE_SIZE}
        >
          {filteredRows.slice(
            visibleFrom === 0 ? 0 : visibleFrom - 1,
            visibleTo,
          )}
        </ListTable>
      )}
      <TablePagination
        summary={t("restaurantSettingsPage.pagination", {
          from: visibleFrom,
          to: visibleTo,
          total,
        })}
        page={activePage}
        totalPages={totalPages}
        loading={tableProps.loading}
        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
        onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
        onPageChange={setPage}
        previousLabel={t("restaurantSettingsPage.previous")}
        nextLabel={t("restaurantSettingsPage.next")}
        pageLabel={t("restaurantSettingsPage.pageOf")}
        jumpLabel={t("restaurantSettingsPage.jumpToPage")}
      />
    </>
  );
}
