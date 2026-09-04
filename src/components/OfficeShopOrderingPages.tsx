import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ShopOrderRecordsPage } from "@/components/ShopOrderRecordsPage";
import {
  fetchShopCatalog,
  fetchShopContacts,
  fetchShopOrderRequests,
  groupCatalogBySupplier,
  sendShopOrderToFactory,
  updateShopOrderLines,
  type ShopCatalogItem,
  type ShopOrderRequest,
  type ShopSupplierContact,
} from "@/lib/shop-orders";

export function OfficeShopSuppliersPage() {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<ShopCatalogItem[]>([]);

  useEffect(() => {
    void fetchShopCatalog().then(setCatalog);
  }, []);

  const groups = useMemo(() => groupCatalogBySupplier(catalog), [catalog]);

  return (
    <section className="ingredients-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{t("shopOrdering.office")}</span>
          <h1>{t("shopOrdering.suppliersTitle")}</h1>
        </div>
      </header>
      <article className="panel ingredients-panel">
        <table className="shop-order-items">
          <thead>
            <tr>
              <th>{t("shopOrdering.supplier")}</th>
              <th>{t("shopOrdering.columns.channel")}</th>
              <th>{t("shopOrdering.columns.itemCount")}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.supplierName}>
                <td>{group.supplierName}</td>
                <td>{group.channel === "fc_internal" ? t("shopOrdering.fcInternal") : t("shopOrdering.external")}</td>
                <td>{group.items.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}

export function OfficeShopRequestsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ShopOrderRequest[]>([]);

  useEffect(() => {
    void fetchShopOrderRequests({ channel: "fc_internal" }).then((items) =>
      setRows(items.filter((row) => row.status !== "sent_to_factory")),
    );
  }, []);

  return (
    <section className="ingredients-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{t("shopOrdering.office")}</span>
          <h1>{t("shopOrdering.requestsTitle")}</h1>
        </div>
      </header>
      <article className="panel ingredients-panel">
        <table className="shop-order-items">
          <thead>
            <tr>
              <th>{t("shopOrdering.columns.number")}</th>
              <th>{t("shopOrdering.columns.supplier")}</th>
              <th>{t("shopOrdering.columns.deliveryDate")}</th>
              <th>{t("shopOrdering.columns.status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.requestNo}</td>
                <td>{row.catalogSupplierName}</td>
                <td>{row.deliveryDate}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}

export function OfficeShopPhonebookPage() {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<ShopCatalogItem[]>([]);
  const [contacts, setContacts] = useState<ShopSupplierContact[]>([]);

  useEffect(() => {
    void fetchShopCatalog().then(async (items) => {
      setCatalog(items);
      const ids = [...new Set(items.map((item) => item.fccSupplierId).filter(Boolean))] as string[];
      const rows = (await Promise.all(ids.map((id) => fetchShopContacts(id)))).flat();
      setContacts(rows);
    });
  }, []);

  const names = new Map(catalog.map((item) => [item.fccSupplierId, item.supplierName]));

  return (
    <section className="ingredients-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{t("shopOrdering.office")}</span>
          <h1>{t("shopOrdering.phonebookTitle")}</h1>
          <p>{t("shopOrdering.phonebookDescription")}</p>
        </div>
      </header>
      <article className="panel ingredients-panel">
        <table className="shop-order-items">
          <thead>
            <tr>
              <th>{t("shopOrdering.supplier")}</th>
              <th>{t("shopOrdering.contact")}</th>
              <th>{t("shopOrdering.columns.phone")}</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((row) => (
              <tr key={row.id}>
                <td>{names.get(row.supplierId) ?? row.supplierId}</td>
                <td>{row.name || "—"}</td>
                <td>{row.phone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}

export function OfficeShopReviewPage() {
  const { t } = useTranslation();
  const access = useCurrentPageAccess();
  const canSend = access.canAccess("restaurant.ordering.review.send_factory");
  const [rows, setRows] = useState<ShopOrderRequest[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetchShopOrderRequests({ channel: "fc_internal" }).then((items) => {
      const pending = items.filter((row) => row.status !== "sent_to_factory");
      setRows(pending);
      const next: Record<string, string> = {};
      for (const row of pending) {
        for (const line of row.lines) next[line.id] = String(line.quantity);
      }
      setQuantities(next);
    });
  }, []);

  const save = async (row: ShopOrderRequest) => {
    await updateShopOrderLines(
      row.id,
      row.lines.map((line) => ({ id: line.id, quantity: Number(quantities[line.id] || line.quantity) })),
    );
    setMessage(t("shopOrdering.reviewSaved"));
  };

  const send = async (row: ShopOrderRequest) => {
    await save(row);
    await sendShopOrderToFactory(row.id);
    setRows((current) => current.filter((item) => item.id !== row.id));
    setMessage(t("shopOrdering.sentFactory"));
  };

  return (
    <section className="ingredients-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{t("shopOrdering.office")}</span>
          <h1>{t("shopOrdering.reviewTitle")}</h1>
          <p>{t("shopOrdering.reviewDescription")}</p>
        </div>
      </header>
      <article className="panel ingredients-panel">
        {message ? <p>{message}</p> : null}
        {rows.map((row) => (
          <div key={row.id} className="shop-review-card">
            <h2>{row.requestNo} · {row.catalogSupplierName} · {row.deliveryDate}</h2>
            <table className="shop-order-items">
              <tbody>
                {row.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.name}</td>
                    <td>{line.unit}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={quantities[line.id] ?? ""}
                        onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="shop-order-actions">
              <Button variant="outline" onClick={() => void save(row)}>{t("shopOrdering.saveChanges")}</Button>
              {canSend ? <Button onClick={() => void send(row)}>{t("shopOrdering.sendFactory")}</Button> : null}
            </div>
          </div>
        ))}
      </article>
    </section>
  );
}

export function OfficeShopRecordsPage() {
  return <ShopOrderRecordsPage office />;
}
