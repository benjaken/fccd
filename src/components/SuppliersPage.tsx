import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, RefreshCw, Store } from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListSearchBar } from "@/components/ui/list-search-bar";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import {
  KITCHEN_SUPPLIERS_VIEW_DETAIL,
} from "@/lib/kitchen-action-permissions";
import {
  fetchSuppliers,
  type SupplierRow,
  type SupplierStatusFilter,
} from "@/lib/suppliers";
import { useDeferredFilter } from "@/lib/use-deferred-filter";

type SuppliersLoader = (filters?: {
  search?: string;
  status?: SupplierStatusFilter;
}) => Promise<SupplierRow[]>;

const SUPPLIER_SKELETON_COLUMNS = [
  { width: "10rem" },
  { width: "6rem" },
  { width: "7rem" },
  { width: "4.5rem" },
  { width: "4.5rem" },
  { width: "16rem" },
  { width: "7rem" },
  { width: "6rem" },
  { width: "5rem" },
];
const SUPPLIER_ACTION_SKELETON = {
  width: "5.5rem",
  variant: "action" as const,
};

const STATUS_OPTIONS: Array<{ value: SupplierStatusFilter; labelKey: string }> = [
  { value: "", labelKey: "suppliers.allStatuses" },
  { value: "active", labelKey: "suppliers.statuses.active" },
  { value: "inactive", labelKey: "suppliers.statuses.inactive" },
];

function StatusBadge({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <span
      className={
        active
          ? "suppliers-status suppliers-status-active"
          : "suppliers-status suppliers-status-inactive"
      }
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

function SupplierDetailPanel({
  open,
  supplier,
  onClose,
  closeLabel,
}: {
  open: boolean;
  supplier: SupplierRow | null;
  onClose: () => void;
  closeLabel: string;
}) {
  const { t } = useTranslation();
  if (!supplier) return null;

  const yes = t("suppliers.yes");
  const no = t("suppliers.no");
  const notSet = t("common.notSet");

  const rows: Array<{ label: string; value: string | null }> = [
    { label: t("suppliers.columns.companyName"), value: supplier.companyName },
    {
      label: t("suppliers.columns.contactPerson"),
      value: supplier.contactPerson,
    },
    {
      label: t("suppliers.columns.phoneNumber"),
      value: supplier.phoneNumber,
    },
    {
      label: t("suppliers.columns.suppliesRawMeat"),
      value: supplier.suppliesRawMeat ? yes : no,
    },
    {
      label: t("suppliers.columns.suppliesRestaurantIngredients"),
      value: supplier.suppliesRestaurantIngredients ? yes : no,
    },
    { label: t("suppliers.columns.comment"), value: supplier.comment },
    {
      label: t("suppliers.columns.deliverySchedule"),
      value: supplier.deliverySchedule,
    },
    {
      label: t("suppliers.columns.paymentSchedule"),
      value: supplier.paymentSchedule,
    },
    {
      label: t("suppliers.columns.status"),
      value: supplier.isActive
        ? t("suppliers.statuses.active")
        : t("suppliers.statuses.inactive"),
    },
  ];

  return (
    <SidePanel
      open={open}
      title={supplier.companyName}
      description={t("suppliers.detailDescription")}
      onClose={onClose}
      closeLabel={closeLabel}
    >
      <dl className="suppliers-detail-fields">
        {rows.map((row) => (
          <div className="suppliers-detail-field" key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value?.trim() ? row.value : notSet}</dd>
          </div>
        ))}
      </dl>
    </SidePanel>
  );
}

export function SuppliersPage({
  loadSuppliers = fetchSuppliers,
  canViewDetail: canViewDetailProp,
}: {
  loadSuppliers?: SuppliersLoader;
  canViewDetail?: boolean;
}) {
  const { t } = useTranslation();
  const pageAccess = useCurrentPageAccess();
  const canViewDetail =
    canViewDetailProp ?? pageAccess.canAccess(KITCHEN_SUPPLIERS_VIEW_DETAIL);

  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState<SupplierStatusFilter>("");
  const statusFilter = useDeferredFilter(status, setStatus);
  const [detailSupplier, setDetailSupplier] = useState<SupplierRow | null>(null);

  const applied = useMemo(
    () => ({ search: appliedSearch, status }),
    [appliedSearch, status],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadSuppliers(applied)
      .then((next) => {
        if (cancelled) return;
        setRows(next);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("suppliers.loadError"),
        );
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applied, loadSuppliers, reloadKey, t]);

  const submitSearch = () => {
    setAppliedSearch(draftSearch.trim());
  };

  const display = (value: string | null | undefined) =>
    value?.trim() ? value : t("common.notSet");

  const openDetail = (row: SupplierRow) => {
    if (!canViewDetail) return;
    setDetailSupplier(row);
  };

  return (
    <section className="suppliers-page">
      <header className="page-heading suppliers-heading">
        <div>
          <span className="eyebrow">{t("navigation.kitchen")}</span>
          <h1>{t("suppliers.title")}</h1>
          <p>{t("suppliers.description")}</p>
        </div>
      </header>

      <article className="panel suppliers-panel">
        <header className="suppliers-toolbar">
          <ListSearchBar
            id="suppliers-search"
            value={draftSearch}
            onChange={setDraftSearch}
            onSubmit={submitSearch}
            label={t("suppliers.search")}
            placeholder={t("suppliers.searchPlaceholder")}
            submitLabel={t("suppliers.searchAction")}
            filtersActive={Boolean(status)}
            onConfirmFilters={statusFilter.confirm}
            onDismissFilters={statusFilter.revert}
            filters={
              <label className="suppliers-status-filter">
                <span>{t("suppliers.statusFilter")}</span>
                <select
                  value={statusFilter.value}
                  onChange={(event) =>
                    statusFilter.setValue(
                      event.target.value as SupplierStatusFilter,
                    )
                  }
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value || "all"} value={option.value}>
                      {t(option.labelKey)}
                    </option>
                  ))}
                </select>
              </label>
            }
          />
        </header>

        {error ? (
          <div className="products-state products-state-error">
            <div>
              <strong>{t("suppliers.loadError")}</strong>
              <span>{error}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReloadKey((current) => current + 1)}
            >
              <RefreshCw />
              {t("suppliers.retry")}
            </Button>
          </div>
        ) : !loading && rows.length === 0 ? (
          <div className="products-state products-state-empty">
            <Store />
            <div>
              <strong>{t("suppliers.empty")}</strong>
              <span>{t("suppliers.emptyDescription")}</span>
            </div>
          </div>
        ) : (
          <ListTable
            className="suppliers-table-wrap"
            onRefresh={() => setReloadKey((current) => current + 1)}
            loading={loading}
            loadingLabel={t("suppliers.loading")}
            skeletonRows={8}
            skeletonColumns={
              canViewDetail
                ? [...SUPPLIER_SKELETON_COLUMNS, SUPPLIER_ACTION_SKELETON]
                : SUPPLIER_SKELETON_COLUMNS
            }
            header={
              <tr>
                <th>{t("suppliers.columns.companyName")}</th>
                <th>{t("suppliers.columns.contactPerson")}</th>
                <th>{t("suppliers.columns.phoneNumber")}</th>
                <th>{t("suppliers.columns.suppliesRawMeat")}</th>
                <th>{t("suppliers.columns.suppliesRestaurantIngredients")}</th>
                <th className="suppliers-comment-cell">
                  {t("suppliers.columns.comment")}
                </th>
                <th>{t("suppliers.columns.deliverySchedule")}</th>
                <th>{t("suppliers.columns.paymentSchedule")}</th>
                <th>{t("suppliers.columns.status")}</th>
                {canViewDetail ? (
                  <th aria-label={t("suppliers.columns.actions")} />
                ) : null}
              </tr>
            }
          >
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.companyName}</strong>
                </td>
                <td>{display(row.contactPerson)}</td>
                <td>{display(row.phoneNumber)}</td>
                <td>{row.suppliesRawMeat ? t("suppliers.yes") : t("suppliers.no")}</td>
                <td>
                  {row.suppliesRestaurantIngredients
                    ? t("suppliers.yes")
                    : t("suppliers.no")}
                </td>
                <td className="suppliers-comment-cell">{display(row.comment)}</td>
                <td>{display(row.deliverySchedule)}</td>
                <td>{display(row.paymentSchedule)}</td>
                <td>
                  <StatusBadge
                    active={row.isActive}
                    activeLabel={t("suppliers.statuses.active")}
                    inactiveLabel={t("suppliers.statuses.inactive")}
                  />
                </td>
                {canViewDetail ? (
                  <td className="table-actions-cell">
                    <div className="table-row-actions">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openDetail(row)}
                        aria-label={t("suppliers.viewDetail", {
                          supplier: row.companyName,
                        })}
                        title={t("suppliers.viewDetailTitle")}
                      >
                        <Eye />
                        {t("suppliers.viewDetailAction")}
                      </Button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </ListTable>
        )}
      </article>

      <SupplierDetailPanel
        open={Boolean(detailSupplier)}
        supplier={detailSupplier}
        onClose={() => setDetailSupplier(null)}
        closeLabel={t("suppliers.closePanel")}
      />
    </section>
  );
}
