import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, CheckCircle2, ChevronRight, MessageCircle, MessageSquareText, Plus, Search, Send, ShoppingCart, Trash2, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { FilterableSelect } from "@/components/ui/filterable-select";
import { SidePanel } from "@/components/ui/side-panel";
import { hongKongDateValue } from "@/lib/restaurant-daily-sales";
import {
  TKO_RESTAURANT_ID,
  buildSupplierOrderMessage,
  canRestaurantEditShopOrder,
  createShopOrderBatch,
  createShopOrderRequest,
  fetchShopCatalog,
  fetchShopContacts,
  fetchShopOrderRequests,
  groupCatalogBySupplier,
  isDeliveryDateAllowed,
  shopCatalogSupplierKey,
  updateSubmittedShopOrder,
  type ShopCatalogItem,
  type ShopOrderRequest,
  type ShopSupplierContact,
} from "@/lib/shop-orders";
import { buildSmsUrl, buildWhatsAppMessageUrl } from "@/lib/shop-whatsapp-call";
import { fetchRestaurantOptions, type RestaurantOption } from "@/lib/restaurant-staff";
import { useMediaQuery } from "@/lib/use-media-query";

import styles from "./ShopOrderPage.module.css";

type ExternalDispatch = {
  request: ShopOrderRequest;
  contact: ShopSupplierContact | null;
  message: string;
  sentVia?: "whatsapp" | "sms";
};

export function ShopOrderPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { requestId = "" } = useParams();
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
  const [productPanelOpen, setProductPanelOpen] = useState(false);
  const [contactsBySupplier, setContactsBySupplier] = useState<Record<string, ShopSupplierContact[]>>({});
  const [contactIds, setContactIds] = useState<Record<string, string>>({});
  const [externalDispatches, setExternalDispatches] = useState<ExternalDispatch[]>([]);
  const [editingRequest, setEditingRequest] = useState<ShopOrderRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const isEditing = Boolean(requestId);
  const isCompactMobile = useMediaQuery("(max-width: 760px)");

  const groups = useMemo(() => groupCatalogBySupplier(catalog), [catalog]);
  const today = hongKongDateValue();
  const selectedGroups = useMemo(() => selectedSupplierKeys
    .map((key) => groups.find((group) => shopCatalogSupplierKey(group) === key))
    .filter((group): group is (typeof groups)[number] => Boolean(group)), [groups, selectedSupplierKeys]);
  const activeGroup = groups.find((group) => shopCatalogSupplierKey(group) === activeSupplierKey) ?? null;
  const availableGroups = groups.filter((group) => !selectedSupplierKeys.includes(shopCatalogSupplierKey(group)));
  const deferredItemSearch = useDeferredValue(itemSearch);
  const normalizedSearch = deferredItemSearch.trim().toLocaleLowerCase();
  const visibleItems = activeGroup?.items.filter((item) => !normalizedSearch
    || `${item.name} ${item.sku ?? ""}`.toLocaleLowerCase().includes(normalizedSearch)) ?? [];
  const chosenItemCount = Object.values(quantities).filter((value) => Number(value) > 0).length;
  const chosenSupplierCount = selectedGroups.filter((group) => group.items.some((item) => Number(quantities[item.id]) > 0)).length;
  const activeSupplierItemCount = activeGroup?.items.filter((item) => Number(quantities[item.id]) > 0).length ?? 0;
  const originalSupplierKey = editingRequest ? shopCatalogSupplierKey({
    channel: editingRequest.channel,
    supplierName: editingRequest.catalogSupplierName,
    fccSupplierId: editingRequest.supplierId,
  }) : "";

  const addSupplier = () => {
    if (!supplierToAdd || selectedSupplierKeys.includes(supplierToAdd)) return;
    setSelectedSupplierKeys((current) => [...current, supplierToAdd]);
    setActiveSupplierKey(supplierToAdd);
    setSupplierToAdd("");
    setSupplierPickerOpen(false);
    setItemSearch("");
    setProductPanelOpen(true);
  };

  const markDispatchOpened = (requestId: string, sentVia: "whatsapp" | "sms") => {
    setExternalDispatches((current) => current.map((dispatch) =>
      dispatch.request.id === requestId ? { ...dispatch, sentVia } : dispatch,
    ));
  };

  const removeSupplier = (key: string) => {
    if (editingRequest && key === originalSupplierKey) return;
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
    if (activeSupplierKey === key) setProductPanelOpen(false);
    setItemSearch("");
  };

  const closeSupplierPicker = () => {
    setSupplierPickerOpen(false);
    setSupplierToAdd("");
  };

  useEffect(() => {
    if (!supplierPickerOpen || !isCompactMobile) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSupplierPicker();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isCompactMobile, supplierPickerOpen]);

  const removeSelectedItem = (itemId: string) => {
    setQuantities((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
  };

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetchShopCatalog(),
      fetchRestaurantOptions(),
      requestId ? fetchShopOrderRequests({ requestId }) : Promise.resolve([] as ShopOrderRequest[]),
    ])
      .then(([items, options, requests]) => {
        if (!active) return;
        setCatalog(items);
        const linked = options.find((option) => option.id === profile?.shop_restro_id)
          ?? options.find((option) => option.legacyId === profile?.shop_restro_legacy_id)
          ?? options.find((option) => option.id === TKO_RESTAURANT_ID)
          ?? options[0]
          ?? null;
        setRestaurant(linked);
        if (requestId) {
          const request = requests.find((row) => row.id === requestId);
          if (!request || !canRestaurantEditShopOrder(request) || (linked && request.restaurantId !== linked.id)) {
            setError(t("shopOrdering.editLoadError"));
            return;
          }
          const supplierItems = items.filter((item) => item.channel === request.channel
            && item.supplierName === request.catalogSupplierName
            && item.fccSupplierId === request.supplierId);
          const supplierKey = shopCatalogSupplierKey({
            channel: request.channel,
            supplierName: request.catalogSupplierName,
            fccSupplierId: request.supplierId,
          });
          setEditingRequest(request);
          setDeliveryDate(request.deliveryDate);
          setNote(request.note ?? "");
          setSelectedSupplierKeys([supplierKey]);
          setActiveSupplierKey(supplierKey);
          setQuantities(Object.fromEntries(supplierItems.map((item) => {
            const line = request.lines.find((value) => value.catalogItemId === item.id)
              ?? request.lines.find((value) => !value.catalogItemId && value.name === item.name && value.sku === item.sku);
            return [item.id, line ? String(line.quantity) : ""];
          })));
        }
      })
      .catch(() => {
        if (active) setError(t("shopOrdering.loadError"));
      });
    return () => {
      active = false;
    };
  }, [profile?.shop_restro_id, profile?.shop_restro_legacy_id, requestId, t]);

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
    if (editingRequest && !orders.some(({ group }) => shopCatalogSupplierKey(group) === originalSupplierKey)) {
      setError(t("shopOrdering.originalSupplierNeedsLines"));
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    setExternalDispatches([]);
    try {
      if (editingRequest) {
        const editedOrder = orders.find(({ group }) => shopCatalogSupplierKey(group) === originalSupplierKey);
        if (!editedOrder) throw new Error("Missing edited order");
        await updateSubmittedShopOrder({
          requestId: editingRequest.id,
          deliveryDate,
          note,
          lines: editedOrder.lines.map(({ item, quantity }) => ({ catalogItemId: item.id, quantity })),
        });
        const addedOrders = orders.filter(({ group }) => shopCatalogSupplierKey(group) !== originalSupplierKey);
        const created = await Promise.all(addedOrders.map(async ({ group, lines }) => {
          const key = shopCatalogSupplierKey(group);
          const contacts = contactsBySupplier[key] ?? [];
          const contact = contacts.find((row) => row.id === contactIds[key]) ?? contacts[0] ?? null;
          const request = await createShopOrderRequest({
            batchId: editingRequest.batchId ?? null,
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
        const externalCreated = created.filter(({ group }) => group.channel === "external");
        if (externalCreated.length) {
          setExternalDispatches(externalCreated.map(({ request, contact, group, lines }) => ({
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
          const addedItemIds = new Set(addedOrders.flatMap(({ group }) => group.items.map((item) => item.id)));
          setQuantities((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !addedItemIds.has(id))));
          setSelectedSupplierKeys([originalSupplierKey]);
          setActiveSupplierKey(originalSupplierKey);
          setSupplierPickerOpen(false);
          setProductPanelOpen(false);
          setMessage(t("shopOrdering.editBatchSaved", { suppliers: created.length }));
        } else {
          navigate("/restaurant-workspace/records", { replace: true });
        }
        return;
      }
      const preparedGroups = orders.map(({ group, lines }) => {
        const key = shopCatalogSupplierKey(group);
        const contacts = contactsBySupplier[key] ?? [];
        const contact = contacts.find((row) => row.id === contactIds[key]) ?? contacts[0] ?? null;
        return {
          group,
          orderLines: lines,
          contact,
          channel: group.channel,
          supplierId: group.fccSupplierId,
          catalogSupplierName: group.supplierName,
          contactId: contact?.id ?? null,
          contactPhone: contact?.phone ?? null,
          lines: lines.map((line) => ({ catalogItemId: line.item.id, quantity: line.quantity })),
          catalogItems: group.items,
        };
      });
      const requests = await createShopOrderBatch({
        restaurantId: restaurant.id,
        deliveryDate,
        note,
        groups: preparedGroups.map(({ group: _group, contact: _contact, orderLines: _orderLines, ...group }) => group),
      });
      const created = preparedGroups.map(({ group, orderLines: lines, contact }) => {
        const request = requests.find((row) => row.channel === group.channel
          && row.supplierId === group.fccSupplierId
          && row.catalogSupplierName === group.supplierName);
        if (!request) throw new Error("Created supplier order was not returned");
        return { request, contact, group, lines };
      });

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
      setProductPanelOpen(false);
      setItemSearch("");
    } catch (cause) {
      const detail = cause && typeof cause === "object" && "message" in cause
        ? String(cause.message)
        : "";
      const editErrorKey = detail.includes("shop_order_no_longer_editable")
        ? "shopOrdering.updatePendingError"
        : "shopOrdering.updateError";
      setError(t(isEditing ? editErrorKey : "shopOrdering.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ingredients-page shop-order-page">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{restaurant?.name ?? t("workspace.restaurant")}</span>
          <h1>{t(isEditing ? "shopOrdering.editOrderTitle" : "shopOrdering.shopOrderTitle")}</h1>
          <p>{editingRequest ? `${editingRequest.requestNo} · ${editingRequest.catalogSupplierName}` : t("shopOrdering.multiSupplierDescription")}</p>
        </div>
      </header>
      <article className="panel ingredients-panel shop-order-form">
        {editingRequest ? <div className="shop-order-edit-context"><Button type="button" size="icon" variant="ghost" aria-label={t("common.back")} onClick={() => navigate("/restaurant-workspace/records")}><ArrowLeft /></Button><span><small>{t("shopOrdering.editOrderTitle")}</small><strong>{editingRequest.requestNo}</strong></span><span className="shop-order-status status-submitted">{t("shopOrdering.status.submitted")}</span></div> : null}
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
            {selectedSupplierKeys.length ? <Button type="button" size={supplierPickerOpen ? "icon" : "sm"} variant="outline" aria-expanded={supplierPickerOpen} aria-label={supplierPickerOpen ? t("common.close") : t("shopOrdering.addSupplier")} onClick={() => setSupplierPickerOpen((current) => !current)}>{supplierPickerOpen ? <X /> : <><Plus />{t("shopOrdering.addSupplier")}</>}</Button> : null}
          </header>
          {!isCompactMobile && (selectedSupplierKeys.length === 0 || supplierPickerOpen) ? <div className="shop-order-supplier-picker">
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

          {selectedGroups.length ? <div className="shop-order-selected-list" role="list" aria-label={t("shopOrdering.selectedSuppliers")}>
            {selectedGroups.map((group) => {
              const key = shopCatalogSupplierKey(group);
              const selectedItems = group.items.filter((item) => Number(quantities[item.id]) > 0);
              const openSupplier = () => { setActiveSupplierKey(key); setItemSearch(""); setProductPanelOpen(true); };
              const canRemoveSupplier = !editingRequest || key !== originalSupplierKey;
              return <article className={`shop-order-selected-supplier${key === activeSupplierKey ? " is-active" : ""}`} role="listitem" key={key}>
                <header>
                  <button type="button" className="shop-order-selected-supplier-open" onClick={openSupplier}>
                    <span><strong>{group.supplierName}</strong><small>{group.channel === "fc_internal" ? t("shopOrdering.fcInternal") : t("shopOrdering.external")}</small></span>
                    <span>{t("shopOrdering.selectedCount", { count: selectedItems.length })}<ChevronRight aria-hidden="true" /></span>
                  </button>
                  {canRemoveSupplier ? <Button type="button" size="icon" variant="ghost" aria-label={t("shopOrdering.removeSupplier", { supplier: group.supplierName })} onClick={() => removeSupplier(key)}><Trash2 aria-hidden="true" /></Button> : null}
                </header>
                {selectedItems.length ? <ul>
                  {selectedItems.map((item) => <li key={item.id}>
                    <button type="button" className="shop-order-selected-item-open" onClick={openSupplier}><span><strong>{item.name}</strong><small>{item.sku ?? ""}</small></span><b>{quantities[item.id]} <small>{item.unit}</small></b></button>
                    <Button type="button" size="icon" variant="ghost" aria-label={t("shopOrdering.removeItem", { item: item.name })} onClick={() => removeSelectedItem(item.id)}><Trash2 aria-hidden="true" /></Button>
                  </li>)}
                </ul> : <button type="button" className="shop-order-selected-empty" onClick={openSupplier}>{t("shopOrdering.noItemsSelected")}<ChevronRight aria-hidden="true" /></button>}
              </article>;
            })}
          </div> : null}

          {!selectedGroups.length ? <div className="shop-order-builder-empty"><ShoppingCart /><strong>{t("shopOrdering.noSupplierSelected")}</strong><span>{t("shopOrdering.noSupplierSelectedHint")}</span>{isCompactMobile ? <Button type="button" className={styles.mobileSupplierTrigger} onClick={() => setSupplierPickerOpen(true)}>{t("shopOrdering.supplierPickerPlaceholder")}</Button> : null}</div> : null}
        </section>

        {error ? <p className="products-state-error" role="alert">{error}</p> : null}
        {message ? <p className="shop-order-success" role="status">{message}</p> : null}
        {externalDispatches.length ? (
          <section className="shop-order-dispatches" aria-labelledby="shop-order-dispatch-title">
            <header><MessageSquareText /><div><h2 id="shop-order-dispatch-title">{t("shopOrdering.dispatchTitle")}</h2><p>{t("shopOrdering.dispatchDescription")}</p></div></header>
            {externalDispatches.map(({ request, contact, message: supplierMessage, sentVia }) => {
              const whatsapp = contact?.phone ? buildWhatsAppMessageUrl(contact.phone, supplierMessage) : null;
              const sms = contact?.phone ? buildSmsUrl(contact.phone, supplierMessage) : null;
              return <article className={`shop-order-dispatch-card${sentVia ? " is-opened" : ""}`} key={request.id}>
                <div className="shop-order-dispatch-info">
                  <div><strong>{request.catalogSupplierName}</strong><span className="shop-order-dispatch-status">{sentVia ? <CheckCircle2 /> : null}{t(sentVia ? "shopOrdering.dispatchOpened" : "shopOrdering.dispatchPending")}</span></div>
                  <dl><div><dt>{t("shopOrdering.columns.number")}</dt><dd>{request.requestNo}</dd></div><div><dt>{t("shopOrdering.columns.phone")}</dt><dd>{contact?.phone ?? t("shopOrdering.noPhone")}</dd></div></dl>
                </div>
                <div className="shop-order-dispatch-actions">
                  {whatsapp ? <a className={`ui-button shop-order-whatsapp${sentVia === "whatsapp" ? " is-opened" : ""}`} href={whatsapp} target="_blank" rel="noreferrer" onClick={() => markDispatchOpened(request.id, "whatsapp")}><MessageCircle />{t("shopOrdering.sendWhatsApp")}</a> : null}
                  {sms ? <a className={`ui-button ui-button-outline${sentVia === "sms" ? " is-opened" : ""}`} href={sms} onClick={() => markDispatchOpened(request.id, "sms")}><MessageSquareText />{t("shopOrdering.sendSms")}</a> : null}
                  {!whatsapp && !sms ? <p>{t("shopOrdering.dispatchNoPhoneHint")}</p> : null}
                </div>
              </article>;
            })}
          </section>
        ) : null}
        <div className="shop-order-actions">
          <span><ShoppingCart />{t("shopOrdering.orderSummary", { suppliers: chosenSupplierCount, items: chosenItemCount })}</span>
          <Button disabled={saving || !restaurant || chosenItemCount === 0} onClick={() => void submit()}>{isEditing ? <Check /> : <Send />}{saving ? t(isEditing ? "shopOrdering.savingChanges" : "shopOrdering.submitting") : t(isEditing ? "shopOrdering.saveOrderChanges" : "shopOrdering.submitBatch")}</Button>
        </div>
      </article>
      <SidePanel
        open={productPanelOpen && Boolean(activeGroup)}
        wide
        className="shop-order-product-panel"
        title={activeGroup?.supplierName ?? ""}
        description={activeGroup ? (activeGroup.channel === "fc_internal" ? t("shopOrdering.sentToOfficeHint") : t("shopOrdering.directSupplierHint")) : undefined}
        closeLabel={t("common.close")}
        onClose={() => { setProductPanelOpen(false); setItemSearch(""); }}
        footer={activeGroup ? <><span className="shop-order-panel-count"><ShoppingCart aria-hidden="true" />{t("shopOrdering.selectedCount", { count: activeSupplierItemCount })}</span><Button type="button" onClick={() => { setProductPanelOpen(false); setItemSearch(""); }}><Check aria-hidden="true" />{t("shopOrdering.doneSelecting")}</Button></> : null}
      >
        {activeGroup ? (() => {
          const key = shopCatalogSupplierKey(activeGroup);
          const contacts = contactsBySupplier[key] ?? [];
          return <div className="shop-order-panel-content">
            <div className="shop-order-panel-toolbar">
              <span className={`shop-channel-badge channel-${activeGroup.channel}`}>{activeGroup.channel === "fc_internal" ? t("shopOrdering.fcInternal") : t("shopOrdering.external")}</span>
              {!editingRequest || key !== originalSupplierKey ? <Button type="button" size="sm" variant="outline" onClick={() => removeSupplier(key)}><Trash2 aria-hidden="true" />{t("shopOrdering.removeCurrentSupplier")}</Button> : <span className="shop-order-original-badge">{t("shopOrdering.originalSupplier")}</span>}
            </div>
            {activeGroup.channel === "external" ? contacts.length ? <label className="ingredients-field shop-order-contact"><span>{t("shopOrdering.contact")}</span><FilterableSelect aria-label={`${activeGroup.supplierName} ${t("shopOrdering.contact")}`} value={contactIds[key] ?? ""} onChange={(event) => setContactIds((current) => ({ ...current, [key]: event.target.value }))}>{contacts.map((row) => <option key={row.id} value={row.id}>{row.name || row.phone} {row.phone}</option>)}</FilterableSelect></label> : <p className="shop-order-contact-empty">{t("shopOrdering.noPhone")}</p> : null}
            <label className="shop-order-local-search"><Search aria-hidden="true" /><input aria-label={t("shopOrdering.searchWithinSupplierPlaceholder", { supplier: activeGroup.supplierName })} type="search" value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder={t("shopOrdering.searchWithinSupplierPlaceholder", { supplier: activeGroup.supplierName })} /></label>
            <div className="shop-order-product-list-heading"><span>{t("shopOrdering.item")}</span><span>{t("shopOrdering.quantity")}</span></div>
            <div className="shop-order-product-list">
              {visibleItems.length ? visibleItems.map((item) => <label className="shop-order-product-row" key={item.id}><span><strong>{item.name}</strong><small>{[item.sku, item.unit].filter(Boolean).join(" · ")}</small></span><span className="shop-order-quantity-field"><small>{t("shopOrdering.quantity")}</small><input aria-label={`${item.name} ${t("shopOrdering.quantity")}`} type="number" min="0" step="any" inputMode="decimal" value={quantities[item.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} placeholder={t("shopOrdering.quantityPlaceholder")} /></span></label>) : <p className="shop-order-no-results">{t("shopOrdering.noMatchingItems")}</p>}
            </div>
          </div>;
        })() : null}
      </SidePanel>
      {isCompactMobile && supplierPickerOpen ? (
        <div className={styles.supplierSheetRoot} role="presentation">
          <button
            type="button"
            className={styles.supplierSheetBackdrop}
            aria-label={t("common.close")}
            onClick={closeSupplierPicker}
          />
          <section
            className={styles.supplierSheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shop-order-supplier-sheet-title"
          >
            <div className={styles.supplierSheetHandle} aria-hidden="true" />
            <header className={styles.supplierSheetHeader}>
              <div>
                <h2 id="shop-order-supplier-sheet-title">{t("shopOrdering.chooseSupplier")}</h2>
                <p>{t("shopOrdering.chooseSupplierHint")}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label={t("common.close")} onClick={closeSupplierPicker}>
                <X />
              </Button>
            </header>
            <div className={styles.supplierSheetBody}>
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
              <Button type="button" disabled={!supplierToAdd} onClick={addSupplier}><Plus />{t("shopOrdering.addSupplier")}</Button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
