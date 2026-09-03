import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchShopOrderRequests, type ShopOrderRequest } from "@/lib/shop-orders";

export function ShopOrderRecordsPage({ office = false }: { office?: boolean }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ShopOrderRequest[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    void fetchShopOrderRequests()
      .then(setRows)
      .catch(() => setError(true));
  }, []);

  return (
    <section className="ingredients-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{office ? t("shopOrdering.office") : t("workspace.restaurant")}</span>
          <h1>{office ? t("shopOrdering.officeRecordsTitle") : t("shopOrdering.recordsTitle")}</h1>
        </div>
      </header>
      <article className="panel ingredients-panel">
        {error ? <p>{t("shopOrdering.loadError")}</p> : null}
        <table className="shop-order-items">
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
                <td>{row.requestNo}</td>
                <td>{row.channel === "fc_internal" ? t("shopOrdering.fcInternal") : t("shopOrdering.external")}</td>
                <td>{row.catalogSupplierName}</td>
                <td>{row.deliveryDate}</td>
                <td>{row.status}</td>
                <td>{row.lines.map((line) => `${line.name} × ${line.quantity}`).join("、")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}
