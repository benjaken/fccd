import { Children, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ListTable } from "@/components/ui/list-table";
import { TablePagination } from "@/components/ui/table-pagination";

export const RESTAURANT_SETTINGS_PAGE_SIZE = 15;

export function RestaurantSettingsListTable({
  children,
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
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const rows = Children.toArray(children);
  const total = rows.length;
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

  return (
    <>
      <ListTable {...tableProps} skeletonRows={RESTAURANT_SETTINGS_PAGE_SIZE}>
        {rows.slice(visibleFrom === 0 ? 0 : visibleFrom - 1, visibleTo)}
      </ListTable>
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
