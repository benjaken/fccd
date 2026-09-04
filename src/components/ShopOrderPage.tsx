import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, MessageSquareText, Plus, Search, Send, ShoppingCart, X } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { FilterableSelect } from "@/components/ui/filterable-select";
import { hongKongDateValue } from "@/lib/restaurant-daily-sales";
import {
  TKO_RESTAURANT_ID,
  buildSupplierOrderMessage,
  createShopOrderRequest,
  fetchShopCatalog,
  fetchShopContacts,
  groupCatalogBySupplier,
  isDeliveryDateAllowed,
  shopCatalogSupplierKey,
  type ShopCatalogItem,
  type ShopOrderRequest,
  type ShopSupplierContact,
} from "@/lib/shop-orders";
import { buildSmsUrl, buildWhatsAppMessageUrl } from "@/lib/shop-whatsapp-call";
import { fetchRestaurantOptions, type RestaurantOption } from "@/lib/restaurant-staff";

type ExternalDispatch = {
  request: ShopOrderRequest;
  contact: ShopSupplierContact | null;
  message: string;
};

export function ShopOrderPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [catalog, setCatalog] = useState<ShopCatalogItem[]>([]);
  const [restaurant, setRestaurant] = useState<RestaurantOption | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [deliveryDate, setDeliveryDate] = useState(() => hongKongDateValue());
  const [note, setNote] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [selectedSupplierKeys, setSelectedSupplierKeys] = useState<string[]>([]);
  const [activeSupplierKey, setActiveSupplierKey] = useState("");
  const [supplierToAdd, setSupplierToAdd] = useState("");
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [contactsBySupplier, setContactsBySupplier] = useState<Record<string, ShopSupplierContact[]>>({});
  const [contactIds, setContactIds] = useState<Record<string, string>>({});
  const [externalDispatches, setExternalDispatches] = useState<ExternalDispatch[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const groups = useMemo(() => groupCatalogBySupplier(catalog), [catalog]);
  const today = hongKongDateValue();
  const selectedGroups = useMemo(() => selectedSupplierKeys
    .map((key) => groups.find((group) => shopCatalogSupplierKey(group) === key))
    .filter((group): group is (typeof groups)[number] => Boolean(group)), [groups, selectedSupplierKeys]);
  const activeGroup = groups.find((group) => shopCatalogSupplierKey(group) === activeSupplierKey) ?? null;
  const availableGroups = groups.filter((group) => !selectedSupplierKeys.includes(shopCatalogSupplierKey(group)));
  const normalizedSearch = itemSearch.trim().toLocaleLowerCase();
  const visibleItems = activeGroup?.items.filter((item) => !normalizedSearch
    || `${item.name} ${item.sku ?? ""}`.toLocaleLowerCase().includes(normalizedSearch)) ?? [];
  const chosenItemCount = Object.values(quantities).filter((value) => Number(value) > 0).length;
  const chosenSupplierCount = selectedGroups.filter((group) => group.items.some((item) => Number(quantities[item.id]) > 0)).length;

  const addSupplier = () => {
    if (!supplierToAdd || selectedSupplierKeys.includes(supplierToAdd)) return;
    setSelectedSupplierKeys((current) => [...current, supplierToAdd]);
    setActiveSupplierKey(supplierToAdd);
    setSupplierToAdd("");
    setSupplierPickerOpen(false);
    setItemSearch("");
  };

  const removeSupplier = (key: string) => {
    const group = groups.find((row) => shopCatalogSupplierKey(row) === key);
    if (group) {
      setQuantities((current) => {
        const next = { ...current };
        group.items.forEach((item) => delete next[item.id]);
        return next;
      });
    }
    setSelectedSupplierKeys((current) => {
      const next = current.filter((row) => row !== key);
      if (activeSupplierKey === key) setActiveSupplierKey(next[0] ?? "");
      return next;
    });
    setItemSearch("");
  };

  useEffect(() => {
    let active = true;
    void Promise.all([fetchShopCatalog(), fetchRestaurantOptions()])
      .then(([items, options]) => {
        if (!active) return;
        setCatalog(items);
        const linked = options.find((option) => option.id === profile?.shop_restro_id)
          ?? options.find((option) => option.legacyId === profile?.shop_restro_legacy_id)
          ?? options.find((option) => option.id === TKO_RESTAURANT_ID)
          ?? options[0]
          ?? null;
        setRestaurant(linked);
      })
      .catch(() => {
        if (active) setError(t("shopOrdering.loadError"));
      });
    return () => {
      active = false;
    };
  }, [profile?.shop_restro_id, profile?.shop_restro_legacy_id, t]);

  useEffect(() => {
    let active = true;
    const externalGroups = groups.filter((group) => group.channel === "external" && group.fccSupplierId);
    void Promise.all(externalGroups.map(async (group) => {
      const key = shopCatalogSupplierKey(group);
      const rows = await fetchShopContacts(group.fccSupplierId!);
      return [key, rows] as const;
    }))
      .then((entries) => {
        if (!active) return;
        setContactsBySupplier(Object.fromEntries(entries));
        setContactIds(Object.fromEntries(entries.map(([key, rows]) => [key, rows[0]?.id ?? ""])));
      })
      .catch(() => {
        if (active) setError(t("shopOrdering.contactLoadError"));
      });
    return () => {
      active = false;
    };
  }, [groups, t]);

  const submit = async () => {
    if (!restaurant || saving) return;
    if (!isDeliveryDateAllowed(deliveryDate, today)) {
      setError(t("shopOrdering.deliveryDateInvalid"));
      return;
    }
    const orders = selectedGroups.map((group) => ({
      group,
      lines: group.items
        .map((item) => ({ item, quantity: Number(quantities[item.id] || 0) }))
        .filter((line) => line.quantity > 0),
    })).filter((order) => order.lines.length > 0);
    if (!orders.length) {
      setError(t("shopOrdering.needLines"));
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    setExternalDispatches([]);
    try {
      const created = await Promise.all(orders.map(async ({ group, lines }) => {
        const key = shopCatalogSupplierKey(group);
        const contacts = contactsBySupplier[key] ?? [];
        const contact = contacts.find((row) => row.id === contactIds[key]) ?? contacts[0] ?? null;
        const request = await createShopOrderRequest({
          restaurantId: restaurant.id,
          channel: group.channel,
          supplierId: group.fccSupplierId,
          catalogSupplierName: group.supplierName,
          deliveryDate,
          note,
          contactId: contact?.id ?? null,
          contactPhone: contact?.phone ?? null,
          lines: lines.map((line) => ({ catalogItemId: line.item.id, quantity: line.quantity })),
          catalogItems: group.items,
        });
        return { request, contact, group, lines };
      }));

      setExternalDispatches(created
        .filter(({ group }) => group.channel === "external")
        .map(({ request, contact, group, lines }) => ({
          request,
          contact,
          message: buildSupplierOrderMessage({
            restaurantName: restaurant.name,
            requestNo: request.requestNo,
            supplierName: group.supplierName,
            deliveryDate,
            note,
            lines: lines.map(({ item, quantity }) => ({ name: item.name, unit: item.unit, quantity })),
          }),
        })));
      setMessage(t("shopOrdering.batchSaved", { suppliers: created.length, items: chosenItemCount }));
      setQuantities({});
      setSelectedSupplierKeys([]);
      setActiveSupplierKey("");
      setSupplierToAdd("");
      setSupplierPickerOpen(false);
      setItemSearch("");
    } catch {
      setError(t("shopOrdering.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ingredients-page shop-order-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{restaurant?.name ?? t("workspace.restaurant")}</span>
          <h1>{t("shopOrdering.shopOrderTitle")}</h1>
          <p>{t("shopOrdering.multiSupplierDescription")}</p>
        </div>
      </header>
      <article className="panel ingredients-panel shop-order-form">
        <div className="shop-order-fixed-fields">
          <label className="ingredients-field">
            <span>{t("shopOrdering.deliveryDate")}</span>
            <input type="date" min={today} value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />
          </label>
          <label className="ingredients-field">
            <span>{t("shopOrdering.note")}</span>
            <input value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>
        <section className={`shop-order-builder${selectedSupplierKeys.length ? " has-suppliers" : ""}${supplierPickerOpen ? " is-picker-open" : ""}`} aria-labelledby="shop-order-builder-title">
          <header className="shop-order-builder-heading">
            <span>1</span>
            <div><h2 id="shop-order-builder-title">{t("shopOrdering.chooseSupplier")}</h2><p>{t("shopOrdering.chooseSupplierHint")}</p></div>
            {selectedSupplierKeys.length && !supplierPickerOpen ? <Button type="button" size="sm" variant="outline" onClick={() => setSupplierPickerOpen(true)}><Plus />{t("shopOrdering.addSupplier")}</Button> : null}
          </header>
          {selectedSupplierKeys.length === 0 || supplierPickerOpen ? <div className="shop-order-supplier-picker">
            <label className="ingredients-field">
              <span>{selectedSupplierKeys.length ? t("shopOrdering.addSupplier") : t("shopOrdering.firstSupplier")}</span>
              <FilterableSelect aria-label={t("shopOrdering.chooseSupplier")} value={supplierToAdd} onChange={(event) => setSupplierToAdd(event.target.value)}>
                <option value="">{t("shopOrdering.supplierPickerPlaceholder")}</option>
                {availableGroups.map((group) => {
                  const key = shopCatalogSupplierKey(group);
                  return <option key={key} value={key}>{group.supplierName} · {group.channel === "fc_internal" ? t("shopOrdering.fcInternal") : t("shopOrdering.external")}</option>;
                })}
              </FilterableSelect>
            </label>
            <Button type="button" variant="outline" disabled={!supplierToAdd} onClick={addSupplier}><Plus />{t("shopOrdering.addSupplier")}</Button>
          </div> : null}

          {selectedGroups.length ? <nav className="shop-order-supplier-tabs" aria-label={t("shopOrdering.selectedSuppliers")}>
            {selectedGroups.map((group) => {
              const key = shopCatalogSupplierKey(group);
              const count = group.items.filter((item) => Number(quantities[item.id]) > 0).length;
              return <button type="button" className={key === activeSupplierKey ? "is-active" : ""} key={key} onClick={() => { setActiveSupplierKey(key); setItemSearch(""); }}><span>{group.supplierName}</span><small>{t("shopOrdering.selectedCount", { count })}</small></button>;
            })}
          </nav> : null}

          {!activeGroup ? (
            <div className="shop-order-builder-empty"><ShoppingCart /><strong>{t("shopOrdering.noSupplierSelected")}</strong><span>{t("shopOrdering.noSupplierSelectedHint")}</span></div>
          ) : (() => {
            const key = shopCatalogSupplierKey(activeGroup);
            const contacts = contactsBySupplier[key] ?? [];
            return <section className="shop-order-active-supplier">
              <header>
                <div><strong>{activeGroup.supplierName}</strong><small>{activeGroup.channel === "fc_internal" ? t("shopOrdering.sentToOfficeHint") : t("shopOrdering.directSupplierHint")}</small></div>
                <span className={`shop-channel-badge channel-${activeGroup.channel}`}>{activeGroup.channel === "fc_internal" ? t("shopOrdering.fcInternal") : t("shopOrdering.external")}</span>
                <Button type="button" size="icon" variant="ghost" aria-label={t("shopOrdering.removeSupplier", { supplier: activeGroup.supplierName })} onClick={() => removeSupplier(key)}><X /></Button>
              </header>
              {activeGroup.channel === "external" ? contacts.length ? <label className="ingredients-field shop-order-contact"><span>{t("shopOrdering.contact")}</span><FilterableSelect aria-label={`${activeGroup.supplierName} ${t("shopOrdering.contact")}`} value={contactIds[key] ?? ""} onChange={(event) => setContactIds((current) => ({ ...current, [key]: event.target.value }))}>{contacts.map((row) => <option key={row.id} value={row.id}>{row.name || row.phone} {row.phone}</option>)}</FilterableSelect></label> : <p className="shop-order-contact-empty">{t("shopOrdering.noPhone")}</p> : null}
              <label className="shop-order-local-search"><Search /><input type="search" value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder={t("shopOrdering.searchWithinSupplier", { supplier: activeGroup.supplierName })} /></label>
              <div className="shop-order-product-list-heading"><span>{t("shopOrdering.item")}</span><span>{t("shopOrdering.quantity")}</span></div>
              <div className="shop-order-product-list">
                {visibleItems.length ? visibleItems.map((item) => <label className="shop-order-product-row" key={item.id}><span><strong>{item.name}</strong><small>{[item.sku, item.unit].filter(Boolean).join(" · ")}</small></span><span className="shop-order-quantity-field"><small>{t("shopOrdering.quantity")}</small><input aria-label={`${item.name} ${t("shopOrdering.quantity")}`} type="number" min="0" step="any" inputMode="decimal" value={quantities[item.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="0" /></span></label>) : <p className="shop-order-no-results">{t("shopOrdering.noMatchingItems")}</p>}
              </div>
            </section>;
          })()}
        </section>

        {error ? <p className="products-state-error" role="alert">{error}</p> : null}
        {message ? <p className="shop-order-success" role="status">{message}</p> : null}
        {externalDispatches.length ? (
          <section className="shop-order-dispatches" aria-labelledby="shop-order-dispatch-title">
            <header><MessageSquareText /><div><h2 id="shop-order-dispatch-title">{t("shopOrdering.dispatchTitle")}</h2><p>{t("shopOrdering.dispatchDescription")}</p></div></header>
            {externalDispatches.map(({ request, contact, message: supplierMessage }) => {
              const whatsapp = contact?.phone ? buildWhatsAppMessageUrl(contact.phone, supplierMessage) : null;
              const sms = contact?.phone ? buildSmsUrl(contact.phone, supplierMessage) : null;
              return <article key={request.id}>
                <div><strong>{request.catalogSupplierName}</strong><small>{request.requestNo} · {contact?.phone ?? t("shopOrdering.noPhone")}</small></div>
                <div>{whatsapp ? <a className="ui-button shop-order-whatsapp" href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle />{t("shopOrdering.sendWhatsApp")}</a> : null}{sms ? <a className="ui-button ui-button-outline" href={sms}><MessageSquareText />{t("shopOrdering.sendSms")}</a> : null}</div>
              </article>;
            })}
          </section>
        ) : null}
        <div className="shop-order-actions">
          <span><ShoppingCart />{t("shopOrdering.orderSummary", { suppliers: chosenSupplierCount, items: chosenItemCount })}</span>
          <Button disabled={saving || !restaurant || chosenItemCount === 0} onClick={() => void submit()}><Send />{saving ? t("shopOrdering.submitting") : t("shopOrdering.submitBatch")}</Button>
        </div>
      </article>
    </section>
  );
}
