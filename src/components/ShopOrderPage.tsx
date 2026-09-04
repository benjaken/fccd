import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FilterableSelect } from "@/components/ui/filterable-select";
import { hongKongDateValue } from "@/lib/restaurant-daily-sales";
import {
  TKO_RESTAURANT_ID,
  createShopOrderRequest,
  fetchShopCatalog,
  fetchShopContacts,
  groupCatalogBySupplier,
  isDeliveryDateAllowed,
  markShopOrderWhatsAppCall,
  type ShopCatalogItem,
  type ShopCatalogSupplier,
  type ShopSupplierContact,
} from "@/lib/shop-orders";
import { buildTelUrl, buildWhatsAppCallUrl } from "@/lib/shop-whatsapp-call";
import { fetchRestaurantOptions, type RestaurantOption } from "@/lib/restaurant-staff";

export function ShopOrderPage() {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<ShopCatalogItem[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [restaurantId, setRestaurantId] = useState(TKO_RESTAURANT_ID);
  const [supplierName, setSupplierName] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [deliveryDate, setDeliveryDate] = useState(() => hongKongDateValue());
  const [note, setNote] = useState("");
  const [contacts, setContacts] = useState<ShopSupplierContact[]>([]);
  const [contactId, setContactId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const groups = useMemo(() => groupCatalogBySupplier(catalog), [catalog]);
  const selected = groups.find((group) => group.supplierName === supplierName) ?? null;
  const today = hongKongDateValue();
  const contact = contacts.find((row) => row.id === contactId) ?? contacts[0] ?? null;

  useEffect(() => {
    void fetchShopCatalog().then(setCatalog).catch(() => setError(t("shopOrdering.loadError")));
    void fetchRestaurantOptions().then((options) => {
      setRestaurants(options);
      if (options.some((option) => option.id === TKO_RESTAURANT_ID)) {
        setRestaurantId(TKO_RESTAURANT_ID);
      } else if (options[0]) {
        setRestaurantId(options[0].id);
      }
    });
  }, [t]);

  useEffect(() => {
    if (!selected?.fccSupplierId || selected.channel !== "external") {
      setContacts([]);
      setContactId("");
      return;
    }
    void fetchShopContacts(selected.fccSupplierId).then((rows) => {
      setContacts(rows);
      setContactId(rows[0]?.id ?? "");
    });
  }, [selected?.channel, selected?.fccSupplierId]);

  const submit = async (openCall: boolean) => {
    if (!selected) return;
    if (!isDeliveryDateAllowed(deliveryDate, today)) {
      setError(t("shopOrdering.deliveryDateInvalid"));
      return;
    }
    const lines = selected.items
      .map((item) => ({ catalogItemId: item.id, quantity: Number(quantities[item.id] || 0) }))
      .filter((line) => line.quantity > 0);
    if (!lines.length) {
      setError(t("shopOrdering.needLines"));
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const created = await createShopOrderRequest({
        restaurantId,
        channel: selected.channel,
        supplierId: selected.fccSupplierId,
        catalogSupplierName: selected.supplierName,
        deliveryDate,
        note,
        contactId: contact?.id ?? null,
        contactPhone: contact?.phone ?? null,
        lines,
        catalogItems: selected.items,
      });
      if (openCall && selected.channel === "external") {
        const phone = contact?.phone ?? null;
        const callUrl = phone ? buildWhatsAppCallUrl(phone) : null;
        await markShopOrderWhatsAppCall(created.id, phone);
        if (callUrl) {
          window.location.href = callUrl;
        } else {
          const tel = phone ? buildTelUrl(phone) : null;
          if (tel) window.location.href = tel;
        }
      }
      setMessage(t("shopOrdering.saved", { number: created.requestNo }));
      setQuantities({});
    } catch {
      setError(t("shopOrdering.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ingredients-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{t("workspace.restaurant")}</span>
          <h1>{t("shopOrdering.shopOrderTitle")}</h1>
          <p>{t("shopOrdering.shopOrderDescription")}</p>
        </div>
      </header>
      <article className="panel ingredients-panel shop-order-form">
        <label className="ingredients-field">
          <span>{t("shopOrdering.restaurant")}</span>
          <FilterableSelect
            aria-label={t("shopOrdering.restaurant")}
            value={restaurantId}
            onChange={(event) => setRestaurantId(event.target.value)}
          >
            {restaurants.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </FilterableSelect>
        </label>
        <label className="ingredients-field">
          <span>{t("shopOrdering.supplier")}</span>
          <FilterableSelect
            aria-label={t("shopOrdering.supplier")}
            value={supplierName}
            onChange={(event) => { setSupplierName(event.target.value); setQuantities({}); }}
          >
            <option value="">{t("shopOrdering.supplierPlaceholder")}</option>
            {groups.map((group) => (
              <option key={group.supplierName} value={group.supplierName}>
                {group.supplierName} ({group.channel === "fc_internal" ? t("shopOrdering.fcInternal") : t("shopOrdering.external")})
              </option>
            ))}
          </FilterableSelect>
        </label>
        <label className="ingredients-field">
          <span>{t("shopOrdering.deliveryDate")}</span>
          <input type="date" min={today} value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />
        </label>
        <label className="ingredients-field">
          <span>{t("shopOrdering.note")}</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        {selected?.channel === "external" ? (
          <label className="ingredients-field">
            <span>{t("shopOrdering.contact")}</span>
            <FilterableSelect
              aria-label={t("shopOrdering.contact")}
              value={contactId}
              onChange={(event) => setContactId(event.target.value)}
            >
              {contacts.length === 0 ? <option value="">{t("shopOrdering.noPhone")}</option> : null}
              {contacts.map((row) => (
                <option key={row.id} value={row.id}>{row.name || row.phone} {row.phone}</option>
              ))}
            </FilterableSelect>
          </label>
        ) : null}
        {selected ? (
          <table className="shop-order-items">
            <thead>
              <tr>
                <th>{t("shopOrdering.item")}</th>
                <th>{t("shopOrdering.unit")}</th>
                <th>{t("shopOrdering.quantity")}</th>
              </tr>
            </thead>
            <tbody>
              {selected.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}{item.sku ? ` (${item.sku})` : ""}</td>
                  <td>{item.unit}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={quantities[item.id] ?? ""}
                      onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {error ? <p className="products-state-error">{error}</p> : null}
        {message ? <p>{message}</p> : null}
        <div className="shop-order-actions">
          {selected?.channel === "external" ? (
            <Button disabled={saving || !contact} onClick={() => void submit(true)}>
              <Phone />
              {t("shopOrdering.whatsappCall")}
            </Button>
          ) : (
            <Button disabled={saving || !selected} onClick={() => void submit(false)}>
              {t("shopOrdering.submitInternal")}
            </Button>
          )}
        </div>
      </article>
    </section>
  );
}
