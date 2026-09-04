import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { RestaurantSettingsListTable } from "@/components/ui/restaurant-settings-list-table";
import {
  TKO_RESTAURANT_ID,
  fetchShopOrderRequests,
  type ShopOrderRequest,
} from "@/lib/shop-orders";

export function ShopOrderRecordsPage({ office = false }: { office?: boolean }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ShopOrderRequest[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(false);
    void fetchShopOrderRequests(office ? undefined : { restaurantId: TKO_RESTAURANT_ID })
      .then(setRows)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [office]);

  const status = (value: string) => (
    <span className={`shop-order-status status-${value}`}>
      {t(`shopOrdering.status.${value}`, { defaultValue: value })}
    </span>
  );

  if (office) {
    return (
      <section className="ingredients-page office-shop-page">
        <header className="page-heading ingredients-heading">
          <div><span className="eyebrow">{t("shopOrdering.office")}</span><h1>{t("shopOrdering.officeRecordsTitle")}</h1><p>{t("shopOrdering.recordsDescription")}</p></div>
        </header>
        <article className="panel ingredients-panel">
          {error ? <p className="office-shop-inline-error">{t("shopOrdering.loadError")}</p> : null}
          <RestaurantSettingsListTable
            loading={loading}
            loadingLabel={t("shopOrdering.loading")}
            skeletonColumns={7}
            searchPlaceholder={t("shopOrdering.searchRecords")}
            emptyTitle={t("shopOrdering.emptyRecords")}
            header={<tr><th>{t("shopOrdering.columns.number")}</th><th>{t("shopOrdering.restaurant")}</th><th>{t("shopOrdering.columns.channel")}</th><th>{t("shopOrdering.columns.supplier")}</th><th>{t("shopOrdering.columns.deliveryDate")}</th><th>{t("shopOrdering.columns.status")}</th><th>{t("shopOrdering.columns.lines")}</th></tr>}
          >
            {rows.map((row) => <tr key={row.id}><td><strong>{row.requestNo}</strong></td><td>{row.restaurantName ?? "—"}</td><td><span className={`shop-channel-badge channel-${row.channel}`}>{row.channel === "fc_internal" ? t("shopOrdering.fcInternal") : t("shopOrdering.external")}</span></td><td>{row.catalogSupplierName}</td><td>{row.deliveryDate}</td><td>{status(row.status)}</td><td>{row.lines.map((line) => `${line.name} × ${line.quantity} ${line.unit}`).join("、")}</td></tr>)}
          </RestaurantSettingsListTable>
        </article>
      </section>
    );
  }

  return (
    <section className="ingredients-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{office ? t("shopOrdering.office") : t("workspace.restaurant")}</span>
          <h1>{office ? t("shopOrdering.officeRecordsTitle") : t("shopOrdering.recordsTitle")}</h1>
        </div>
      </header>
      <article className="panel ingredients-panel shop-records-panel">
        {error ? <p>{t("shopOrdering.loadError")}</p> : null}
        {rows.length === 0 && !error ? <p>{t("shopOrdering.emptyRecords")}</p> : null}
        <div className="shop-order-table-wrap">
        <table className="shop-order-items shop-order-records-table">
          <thead>
            <tr>
              <th>{t("shopOrdering.columns.number")}</th>
              <th>{t("shopOrdering.columns.channel")}</th>
              <th>{t("shopOrdering.columns.supplier")}</th>
              <th>{t("shopOrdering.columns.deliveryDate")}</th>
              <th>{t("shopOrdering.columns.status")}</th>
              <th>{t("shopOrdering.columns.lines")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td data-label={t("shopOrdering.columns.number")}>{row.requestNo}</td>
                <td data-label={t("shopOrdering.columns.channel")}>{row.channel === "fc_internal" ? t("shopOrdering.fcInternal") : t("shopOrdering.external")}</td>
                <td data-label={t("shopOrdering.columns.supplier")}>{row.catalogSupplierName}</td>
                <td data-label={t("shopOrdering.columns.deliveryDate")}>{row.deliveryDate}</td>
                <td data-label={t("shopOrdering.columns.status")}><span className={`shop-order-status status-${row.status}`}>{t(`shopOrdering.status.${row.status}`, { defaultValue: row.status })}</span></td>
                <td data-label={t("shopOrdering.columns.lines")}>{row.lines.map((line) => `${line.name} × ${line.quantity} ${line.unit}`).join("、")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </article>
    </section>
  );
}
