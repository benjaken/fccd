import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ClipboardList,
  Clock3,
  Eye,
  MessageCircle,
  PackagePlus,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { FilterableSelect } from "@/components/ui/filterable-select";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { OperationalListState } from "@/components/ui/operational-list-state";
import { RestaurantSettingsListTable } from "@/components/ui/restaurant-settings-list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { SearchSelect } from "@/components/ui/search-select";
import { ShopOrderRecordsPage } from "@/components/ShopOrderRecordsPage";
import { SuppliersPage } from "@/components/SuppliersPage";
import {
  createShopSupplierContact,
  createShopOrderRequest,
  fetchAllShopContacts,
  fetchShopCatalog,
  fetchShopOrderEvents,
  fetchShopDeliveryFormOptions,
  fetchShopSupplierRecords,
  fetchShopOrderRequests,
  groupShopOrderRecords,
  groupCatalogBySupplier,
  reviewShopOrder,
  sendShopOrderToFactory,
  shopCatalogSupplierKey,
  updateShopSupplierContact,
  updateShopOrderLines,
  updateShopOrderDeliveryDetails,
  type ShopOrderRequest,
  type ShopOrderEvent,
  type ShopCatalogItem,
  type ShopSupplierContact,
} from "@/lib/shop-orders";
import { buildTelUrl, buildWhatsAppCallUrl } from "@/lib/shop-whatsapp-call";
import type { SupplierRow } from "@/lib/suppliers";

function OfficeShopHeading({ title, description }: { title: string; description?: string }) {
  const { t } = useTranslation();
  return (
    <header className="page-heading ingredients-heading">
      <div>
        <span className="eyebrow">{t("shopOrdering.office")}</span>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
    </header>
  );
}

function ShopStatus({ status }: { status: string }) {
  const { t } = useTranslation();
  return <span className={`shop-order-status status-${status}`}>{t(`shopOrdering.status.${status}`, { defaultValue: status })}</span>;
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="office-shop-state">
      <OperationalListState
        icon={AlertCircle}
        title={t("shopOrdering.loadError")}
        retryLabel={t("shopOrdering.retry")}
        onRetry={onRetry}
      />
    </div>
  );
}

export function OfficeShopSuppliersPage() {
  return <SuppliersPage loadSuppliers={fetchShopSupplierRecords} context="restaurant-ordering" showCreate={false} />;
}

function orderWorkspacePath(
  requestId: string,
  source: "requests" | "records" | "review",
) {
  return `/restaurant/ordering/review/${requestId}?from=${source}`;
}

export function OfficeShopRequestsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ShopOrderRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    void fetchShopOrderRequests({ channel: "fc_internal" })
      .then((items) => setRows(items.filter((row) => ["submitted", "reviewed"].includes(row.status))))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  return (
    <section className="ingredients-page office-shop-page">
      <OfficeShopHeading title={t("shopOrdering.requestsTitle")} description={t("shopOrdering.requestsDescription")} />
      <article className="panel ingredients-panel">
        {error ? <LoadError onRetry={load} /> : (
          <RestaurantSettingsListTable
            loading={loading}
            loadingLabel={t("shopOrdering.loading")}
            skeletonColumns={7}
            searchPlaceholder={t("shopOrdering.searchRequests")}
            emptyTitle={t("shopOrdering.emptyRequests")}
            header={<tr><th>{t("shopOrdering.columns.number")}</th><th>{t("shopOrdering.restaurant")}</th><th>{t("shopOrdering.columns.supplier")}</th><th>{t("shopOrdering.columns.deliveryDate")}</th><th>{t("shopOrdering.columns.itemCount")}</th><th>{t("shopOrdering.columns.status")}</th><th aria-label={t("shopOrdering.columns.actions")} /></tr>}
          >
            {rows.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.requestNo}</strong></td>
                <td>{row.restaurantName ?? "—"}</td>
                <td>{row.catalogSupplierName}</td>
                <td>{row.deliveryDate}</td>
                <td>{row.lines.length}</td>
                <td><ShopStatus status={row.status} /></td>
                <td className="table-actions-cell"><div className="table-row-actions"><Button type="button" size="sm" variant="outline" onClick={() => navigate(orderWorkspacePath(row.id, "requests"))}><Eye />{t("shopOrdering.viewDetails")}</Button></div></td>
              </tr>
            ))}
          </RestaurantSettingsListTable>
        )}
      </article>
    </section>
  );
}

export function OfficeShopPhonebookPage() {
  const { t } = useTranslation();
  const access = useCurrentPageAccess();
  const canEdit = access.canAccess("restaurant.ordering.phonebook.edit");
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [contacts, setContacts] = useState<ShopSupplierContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<"create" | "edit">("create");
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    void Promise.all([fetchShopSupplierRecords(), fetchAllShopContacts()])
      .then(([supplierRows, contactRows]) => {
        setSuppliers(supplierRows);
        setContacts(contactRows);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  const rows = useMemo(
    () =>
      suppliers.flatMap((supplier) => {
        const supplierContacts = contacts.filter(
          (contact) => contact.supplierId === supplier.id,
        );
        const masterPhone = supplier.phoneNumber?.trim() ?? "";
        const contactRows = supplierContacts.map((contact) => ({
          id: contact.id,
          contactId: contact.id as string | null,
          supplierId: supplier.id,
          supplierName: supplier.companyName,
          contactName: contact.name,
          phone: contact.phone,
          note: contact.note,
        }));

        if (
          supplierContacts.length === 0
        ) {
          contactRows.push({
            id: `supplier-${supplier.id}`,
            contactId: null,
            supplierId: supplier.id,
            supplierName: supplier.companyName,
            contactName: supplier.contactPerson,
            phone: masterPhone,
            note: supplier.comment,
          });
        }
        return contactRows;
      }),
    [contacts, suppliers],
  );

  const closePanel = () => {
    if (saving) return;
    setPanelOpen(false);
    setEditingContactId(null);
    setFormError("");
  };

  const openCreate = () => {
    setPanelMode("create");
    setEditingContactId(null);
    setSupplierId(suppliers[0]?.id ?? "");
    setContactName("");
    setPhone("");
    setNote("");
    setFormError("");
    setPanelOpen(true);
  };

  const openEdit = (row: (typeof rows)[number]) => {
    setPanelMode("edit");
    setEditingContactId(row.contactId);
    setSupplierId(row.supplierId);
    setContactName(row.contactName ?? "");
    setPhone(row.phone);
    setNote(row.note ?? "");
    setFormError("");
    setPanelOpen(true);
  };

  const saveContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supplierId) {
      setFormError(t("shopOrdering.supplierRequired"));
      return;
    }
    if (!phone.trim()) {
      setFormError(t("shopOrdering.phoneRequired"));
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const input = { supplierId, name: contactName, phone, note };
      const saved = editingContactId
        ? await updateShopSupplierContact(editingContactId, input)
        : await createShopSupplierContact(input);
      setContacts((current) =>
        editingContactId
          ? current.map((contact) => contact.id === saved.id ? saved : contact)
          : [...current, saved],
      );
      setPanelOpen(false);
      setEditingContactId(null);
    } catch (saveError) {
      setFormError(
        saveError instanceof Error
          ? saveError.message
          : t("shopOrdering.contactSaveError"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ingredients-page office-shop-page">
      <OfficeShopHeading title={t("shopOrdering.phonebookTitle")} description={t("shopOrdering.phonebookDescription")} />
      <article className="panel ingredients-panel">
        {error ? <LoadError onRetry={load} /> : (
          <RestaurantSettingsListTable
            loading={loading}
            loadingLabel={t("shopOrdering.loading")}
            skeletonColumns={5}
            searchPlaceholder={t("shopOrdering.searchContacts")}
            emptyTitle={t("shopOrdering.emptyContacts")}
            toolbarAction={canEdit ? (
              <Button type="button" onClick={openCreate}>
                <Plus />{t("shopOrdering.addContact")}
              </Button>
            ) : null}
            header={
              <tr>
                <th>{t("shopOrdering.supplier")}</th>
                <th>{t("shopOrdering.contact")}</th>
                <th>{t("shopOrdering.columns.phone")}</th>
                <th>{t("shopOrdering.note")}</th>
                <th>{t("shopOrdering.columns.actions")}</th>
              </tr>
            }
          >
            {rows.map((row) => {
              const whatsappUrl = buildWhatsAppCallUrl(row.phone);
              const telUrl = buildTelUrl(row.phone);
              const hasPhone = Boolean(whatsappUrl && telUrl);
              return (
                <tr key={row.id}>
                  <td><strong>{row.supplierName}</strong></td>
                  <td>{row.contactName || "—"}</td>
                  <td>
                    {hasPhone ? (
                      <a className="table-primary-link" href={telUrl!}>{row.phone}</a>
                    ) : t("shopOrdering.noPhone")}
                  </td>
                  <td>{row.note || "—"}</td>
                  <td className="table-actions-cell">
                    <div className="table-row-actions office-shop-phone-actions">
                      {hasPhone ? (
                        <>
                          <Button asChild variant="outline" size="sm">
                            <a href={whatsappUrl!} aria-label={t("shopOrdering.whatsappSupplier", { supplier: row.supplierName })}>
                              <MessageCircle />{t("shopOrdering.whatsappAction")}
                            </a>
                          </Button>
                          <Button asChild variant="outline" size="sm">
                            <a href={telUrl!} aria-label={t("shopOrdering.callSupplier", { supplier: row.supplierName })}>
                              <Phone />{t("shopOrdering.phoneAction")}
                            </a>
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="outline" size="sm" disabled title={t("shopOrdering.noPhone")}>
                            <MessageCircle />{t("shopOrdering.whatsappAction")}
                          </Button>
                          <Button variant="outline" size="sm" disabled title={t("shopOrdering.noPhone")}>
                            <Phone />{t("shopOrdering.phoneAction")}
                          </Button>
                        </>
                      )}
                      {canEdit ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={t("shopOrdering.editContactFor", { supplier: row.supplierName })}
                          title={t("shopOrdering.editContact")}
                          onClick={() => openEdit(row)}
                        >
                          <Pencil />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </RestaurantSettingsListTable>
        )}
      </article>
      <SidePanel
        open={panelOpen && canEdit}
        title={t(panelMode === "edit" ? "shopOrdering.editContactTitle" : "shopOrdering.addContactTitle")}
        description={t("shopOrdering.contactFormDescription")}
        onClose={closePanel}
        closeLabel={t("shopOrdering.closeContactPanel")}
        footer={
          <>
            <Button type="button" variant="outline" disabled={saving} onClick={closePanel}>
              {t("shopOrdering.cancel")}
            </Button>
            <Button type="submit" form="shop-phonebook-contact-form" disabled={saving}>
              <Save />{t(saving ? "shopOrdering.savingContact" : "shopOrdering.saveContact")}
            </Button>
          </>
        }
      >
        <form id="shop-phonebook-contact-form" className="ingredients-form" onSubmit={(event) => void saveContact(event)}>
          <div className="ingredients-field">
            <span>{t("shopOrdering.supplier")}</span>
            <SearchSelect
              id="shop-phonebook-supplier"
              label={t("shopOrdering.supplier")}
              value={supplierId}
              disabled={saving}
              options={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.companyName }))}
              placeholder={t("shopOrdering.supplierPickerPlaceholder")}
              searchPlaceholder={t("shopOrdering.supplierSearchPlaceholder")}
              onChange={(option) => setSupplierId(option.id)}
            />
          </div>
          <label className="ingredients-field">
            <span>{t("shopOrdering.contact")}</span>
            <input value={contactName} disabled={saving} onChange={(event) => setContactName(event.target.value)} />
          </label>
          <label className="ingredients-field">
            <span>{t("shopOrdering.columns.phone")}</span>
            <input type="tel" inputMode="tel" required value={phone} disabled={saving} onChange={(event) => setPhone(event.target.value)} />
          </label>
          <label className="ingredients-field">
            <span>{t("shopOrdering.note")}</span>
            <textarea rows={4} value={note} disabled={saving} onChange={(event) => setNote(event.target.value)} />
          </label>
          {formError ? <p className="list-inline-error" role="alert">{formError}</p> : null}
        </form>
      </SidePanel>
    </section>
  );
}

export function OfficeShopReviewDrawerPage() {
  const { t } = useTranslation();
  const access = useCurrentPageAccess();
  const canSend = access.canAccess("restaurant.ordering.review.send_factory");
  const [rows, setRows] = useState<ShopOrderRequest[]>([]);
  const [selected, setSelected] = useState<ShopOrderRequest | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    void fetchShopOrderRequests({ channel: "fc_internal" }).then((items) => {
      setRows(items.filter((row) => ["submitted", "reviewed"].includes(row.status)));
    }).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const openReview = (row: ShopOrderRequest) => {
    setSelected(row);
    setMessage("");
    setQuantities(Object.fromEntries(row.lines.map((line) => [line.id, String(line.quantity)])));
  };

  const save = async (row: ShopOrderRequest) => {
    const lines = row.lines.map((line) => ({ id: line.id, quantity: Number(quantities[line.id]) }));
    if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) {
      setMessage(t("shopOrdering.quantityInvalid"));
      return false;
    }
    setBusy(true);
    setMessage("");
    try {
      await updateShopOrderLines(row.id, lines);
      setRows((current) => current.map((item) => item.id === row.id ? {
        ...item,
        status: "reviewed",
        lines: item.lines.map((line) => ({ ...line, quantity: lines.find((value) => value.id === line.id)?.quantity ?? line.quantity })),
      } : item));
      setSelected((current) => current?.id === row.id ? { ...current, status: "reviewed" } : current);
      setMessage(t("shopOrdering.reviewSaved"));
      return true;
    } catch {
      setMessage(t("shopOrdering.reviewSaveError"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const send = async (row: ShopOrderRequest) => {
    if (!await save(row)) return;
    setBusy(true);
    try {
      await sendShopOrderToFactory(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
      setSelected(null);
    } catch {
      setMessage(t("shopOrdering.sendFactoryError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ingredients-page office-shop-page">
      <OfficeShopHeading title={t("shopOrdering.reviewTitle")} description={t("shopOrdering.reviewDescription")} />
      <article className="panel ingredients-panel">
        {error ? <LoadError onRetry={load} /> : (
          <RestaurantSettingsListTable
            loading={loading}
            loadingLabel={t("shopOrdering.loading")}
            skeletonColumns={7}
            searchPlaceholder={t("shopOrdering.searchRequests")}
            emptyTitle={t("shopOrdering.emptyReview")}
            header={<tr><th>{t("shopOrdering.columns.number")}</th><th>{t("shopOrdering.restaurant")}</th><th>{t("shopOrdering.columns.supplier")}</th><th>{t("shopOrdering.columns.deliveryDate")}</th><th>{t("shopOrdering.columns.itemCount")}</th><th>{t("shopOrdering.columns.status")}</th><th aria-label={t("shopOrdering.columns.actions")} /></tr>}
          >
            {rows.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.requestNo}</strong></td>
                <td>{row.restaurantName ?? "—"}</td>
                <td>{row.catalogSupplierName}</td>
                <td>{row.deliveryDate}</td>
                <td>{row.lines.length}</td>
                <td><ShopStatus status={row.status} /></td>
                <td className="table-actions-cell"><div className="table-row-actions"><Button size="icon" variant="outline" aria-label={t("shopOrdering.openReview", { number: row.requestNo })} onClick={() => openReview(row)}><Eye /></Button></div></td>
              </tr>
            ))}
          </RestaurantSettingsListTable>
        )}
      </article>
      <SidePanel
        open={Boolean(selected)}
        wide
        title={selected ? t("shopOrdering.reviewPanelTitle", { number: selected.requestNo }) : ""}
        description={selected ? `${selected.catalogSupplierName} · ${selected.deliveryDate}` : undefined}
        closeLabel={t("shopOrdering.closeReview")}
        onClose={() => setSelected(null)}
        footer={selected ? <><Button variant="outline" disabled={busy} onClick={() => void save(selected)}><Save />{t("shopOrdering.saveChanges")}</Button>{canSend ? <Button disabled={busy} onClick={() => void send(selected)}><Send />{t("shopOrdering.sendFactory")}</Button> : null}</> : null}
      >
        {selected ? <div className="office-shop-review-detail">
          <dl><div><dt>{t("shopOrdering.restaurant")}</dt><dd>{selected.restaurantName ?? "—"}</dd></div><div><dt>{t("shopOrdering.columns.status")}</dt><dd><ShopStatus status={selected.status} /></dd></div>{selected.note ? <div><dt>{t("shopOrdering.note")}</dt><dd>{selected.note}</dd></div> : null}</dl>
          {message ? <p className="office-shop-review-message" role="status">{message}</p> : null}
          <div className="table-wrap operational-table-wrap"><table><thead><tr><th>{t("shopOrdering.item")}</th><th>{t("shopOrdering.unit")}</th><th>{t("shopOrdering.quantity")}</th></tr></thead><tbody>{selected.lines.map((line) => <tr key={line.id}><td><strong>{line.name}</strong>{line.sku ? <small>{line.sku}</small> : null}</td><td>{line.unit}</td><td><input aria-label={t("shopOrdering.editQuantity", { item: line.name })} type="number" min="0.01" step="any" value={quantities[line.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))} /></td></tr>)}</tbody></table></div>
        </div> : <OperationalListState icon={ClipboardList} title={t("shopOrdering.emptyReview")} />}
      </SidePanel>
    </section>
  );
}

type ReviewDraftLine = {
  requestId: string;
  channel: ShopOrderRequest["channel"];
  supplierId: string | null;
  supplierName: string;
  catalogItemId: string;
  name: string;
  unit: string;
  sku: string | null;
  warehouse: ShopOrderRequest["lines"][number]["warehouse"];
  quantity: string;
};

type ReviewStep = "details" | "items" | "decision";

const OFFICE_REVIEW_HISTORY_STATUSES = new Set([
  "submitted",
  "reviewed",
  "rejected",
  "sent_to_factory",
  "in_transit",
  "shipped",
  "received",
  "exception",
]);

function formatReviewDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function OfficeShopReviewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { requestId = "" } = useParams();
  const access = useCurrentPageAccess();
  const canReview = access.canAccess("restaurant.ordering.review");
  const canSend = access.canAccess("restaurant.ordering.review.send_factory");
  const [rows, setRows] = useState<ShopOrderRequest[]>([]);
  const [catalog, setCatalog] = useState<ShopCatalogItem[]>([]);
  const [selected, setSelected] = useState<ShopOrderRequest | null>(null);
  const [draftLines, setDraftLines] = useState<ReviewDraftLine[]>([]);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [shippingMethods, setShippingMethods] = useState<Array<{ id: string; name: string }>>([]);
  const [shippingMethodId, setShippingMethodId] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [events, setEvents] = useState<ShopOrderEvent[]>([]);
  const [supplierToAdd, setSupplierToAdd] = useState("");
  const [productToAdd, setProductToAdd] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<"save" | "approve" | "return" | "send" | null>(null);
  const [activeStep, setActiveStep] = useState<ReviewStep>("details");

  const showOrder = useCallback((row: ShopOrderRequest) => {
    const supplierOrders = row.supplierOrders ?? [row];
    setSelected(row);
    setDeliveryDate(row.deliveryDate);
    setOrderNote(row.note ?? "");
    setShippingMethodId(row.shippingMethodId ?? "");
    setContactPerson(row.deliveryContactPerson ?? "");
    setDeliveryPhone(row.deliveryPhone ?? "");
    setDeliveryAddress(row.deliveryAddress ?? "");
    setReviewNote("");
    setSupplierToAdd("");
    setProductToAdd("");
    setMessage(null);
    setActiveStep("details");
    setEvents([]);
    setDraftLines(supplierOrders.flatMap((order) => order.lines.map((line) => ({
      requestId: order.id,
      channel: order.channel,
      supplierId: order.supplierId,
      supplierName: order.catalogSupplierName,
      catalogItemId: line.catalogItemId ?? `legacy-${line.id}`,
      name: line.name,
      unit: line.unit,
      sku: line.sku,
      warehouse: line.warehouse,
      quantity: String(line.quantity),
    }))));
    void Promise.all(supplierOrders.map(async (order) => {
      const orderEvents = await fetchShopOrderEvents(order.id);
      return orderEvents.map((event) => ({
        ...event,
        payload: { ...event.payload, supplierName: order.catalogSupplierName },
      }));
    })).then((groups) => setEvents(groups.flat().sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ))).catch(() => setEvents([]));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    void Promise.all([
      fetchShopOrderRequests(requestId ? { requestId } : { channel: "fc_internal" }),
      fetchShopCatalog(),
      fetchShopDeliveryFormOptions(null),
    ]).then(async ([requests, products, deliveryOptions]) => {
      setCatalog(products);
      setShippingMethods(deliveryOptions.shippingMethods);
      if (requestId) {
        const requested = requests.find((row) => row.id === requestId);
        if (!requested) {
          setError(true);
          return;
        }
        const supplierOrders = requested.batchId
          ? await fetchShopOrderRequests({ batchId: requested.batchId })
          : [requested];
        showOrder({ ...requested, supplierOrders });
      } else {
        setSelected(null);
        setRows(requests.filter((row) => OFFICE_REVIEW_HISTORY_STATUSES.has(row.status)));
      }
    }).catch(() => setError(true)).finally(() => setLoading(false));
  }, [requestId, showOrder]);
  useEffect(load, [load]);

  const groupedRows = useMemo(() => groupShopOrderRecords(rows), [rows]);

  const scrollToStep = useCallback((step: ReviewStep) => {
    setActiveStep(step);
    const section = document.getElementById(`office-review-${step}`);
    if (section && typeof section.scrollIntoView === "function") {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  useEffect(() => {
    if (!selected || typeof IntersectionObserver === "undefined") return;
    const sections = (["details", "items", "decision"] as const)
      .map((step) => document.getElementById(`office-review-${step}`))
      .filter((section): section is HTMLElement => Boolean(section));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const step = visible?.target.getAttribute("data-review-step") as ReviewStep | null;
      if (step) setActiveStep(step);
    }, { rootMargin: "-18% 0px -62% 0px", threshold: [0, 0.25, 0.5, 0.75] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [selected]);

  const openReview = (row: ShopOrderRequest) => {
    const request = (row.supplierOrders ?? [row]).find((item) => item.channel === "fc_internal")
      ?? (row.supplierOrders ?? [row])[0];
    navigate(orderWorkspacePath(request.id, "review"));
  };

  const closeOrder = () => {
    if (!requestId) {
      setSelected(null);
      return;
    }
    navigate("/restaurant/ordering/review");
  };

  const availableProducts = useMemo(() => {
    if (!selected) return [];
    const selectedIds = new Set(draftLines.map((line) => line.catalogItemId));
    const supplierOrders = (selected.supplierOrders ?? [selected])
      .filter((order) => order.channel === "fc_internal");
    return catalog.filter((item) => supplierOrders.some((order) =>
      item.channel === order.channel
      && item.supplierName === order.catalogSupplierName
      && item.fccSupplierId === order.supplierId,
    ) && !selectedIds.has(item.id));
  }, [catalog, draftLines, selected]);

  const catalogSupplierGroups = useMemo(() => groupCatalogBySupplier(catalog), [catalog]);
  const availableSupplierGroups = useMemo(() => {
    if (!selected) return [];
    const existingKeys = new Set((selected.supplierOrders ?? [selected]).map((order) =>
      shopCatalogSupplierKey({
        channel: order.channel,
        fccSupplierId: order.supplierId,
        supplierName: order.catalogSupplierName,
      }),
    ));
    return catalogSupplierGroups.filter((group) =>
      group.channel === "fc_internal" && !existingKeys.has(shopCatalogSupplierKey(group)),
    );
  }, [catalogSupplierGroups, selected]);

  const actionableOrders = (selected?.supplierOrders ?? (selected ? [selected] : []))
    .filter((order) => order.channel === "fc_internal");
  const canActOnSelected = Boolean(
    canReview &&
      actionableOrders.length > 0 &&
      actionableOrders.every((order) =>
        ["submitted", "reviewed"].includes(order.status)
        && order.lines.every((line) => Boolean(line.catalogItemId))),
  );
  const allActionableReviewed = actionableOrders.length > 0
    && actionableOrders.every((order) => order.status === "reviewed");

  const addSupplier = () => {
    if (!selected?.batchId) return;
    const group = availableSupplierGroups.find((candidate) =>
      shopCatalogSupplierKey(candidate) === supplierToAdd,
    );
    if (!group) return;
    const draftId = `draft-supplier-${shopCatalogSupplierKey(group)}`;
    const draftOrder: ShopOrderRequest = {
      ...selected,
      id: draftId,
      batchId: selected.batchId,
      channel: group.channel,
      supplierId: group.fccSupplierId,
      catalogSupplierName: group.supplierName,
      status: "submitted",
      contactPhone: null,
      whatsappCallStatus: null,
      whatsappCalledAt: null,
      lines: [],
      supplierOrders: undefined,
    };
    setSelected((current) => current ? {
      ...current,
      supplierOrders: [...(current.supplierOrders ?? [current]), draftOrder],
    } : current);
    setSupplierToAdd("");
    setProductToAdd("");
    setMessage(null);
  };

  const removeDraftSupplier = (requestIdToRemove: string) => {
    if (!requestIdToRemove.startsWith("draft-supplier-")) return;
    setSelected((current) => current ? {
      ...current,
      supplierOrders: (current.supplierOrders ?? [current]).filter((order) => order.id !== requestIdToRemove),
    } : current);
    setDraftLines((current) => current.filter((line) => line.requestId !== requestIdToRemove));
    setProductToAdd("");
  };

  const addProduct = () => {
    const item = catalog.find((candidate) => candidate.id === productToAdd);
    const targetOrder = actionableOrders.find((order) =>
      item?.channel === order.channel
      && item.supplierName === order.catalogSupplierName
      && item.fccSupplierId === order.supplierId);
    if (!item || !targetOrder) return;
    setDraftLines((current) => [...current, {
      requestId: targetOrder.id,
      channel: targetOrder.channel,
      supplierId: targetOrder.supplierId,
      supplierName: targetOrder.catalogSupplierName,
      catalogItemId: item.id,
      name: item.name,
      unit: item.unit,
      sku: item.sku,
      warehouse: item.warehouse,
      quantity: "1",
    }]);
    setProductToAdd("");
    setMessage(null);
  };

  const getValidLines = () => {
    const groups = actionableOrders.map((order) => ({
      requestId: order.id,
      lines: draftLines.filter((line) => line.requestId === order.id).map((line) => ({
        catalogItemId: line.catalogItemId,
        quantity: Number(line.quantity),
      })),
    }));
    if (groups.some((group) => !group.lines.length)) {
      setMessage({ tone: "error", text: t("shopOrdering.needLines") });
      return null;
    }
    if (groups.some((group) => group.lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0))) {
      setMessage({ tone: "error", text: t("shopOrdering.quantityInvalid") });
      return null;
    }
    if (!deliveryDate) {
      setMessage({ tone: "error", text: t("shopOrdering.deliveryDateInvalid") });
      return null;
    }
    if (!shippingMethodId || !contactPerson.trim()) {
      setMessage({ tone: "error", text: t("shopOrdering.deliveryDetailsRequired") });
      return null;
    }
    return groups;
  };

  const runReviewAction = async (action: "save" | "approve" | "return") => {
    if (!selected) return;
    const lineGroups = getValidLines();
    if (!lineGroups) return;
    if (action === "return" && !reviewNote.trim()) {
      scrollToStep("decision");
      setMessage({ tone: "error", text: t("shopOrdering.returnReasonRequired") });
      return;
    }
    setBusy(action);
    setMessage(null);
    try {
      if (selected.batchId) {
        await updateShopOrderDeliveryDetails({
          batchId: selected.batchId,
          shippingMethodId,
          contactPerson,
          phone: deliveryPhone,
          deliveryAddress,
        });
      }
      const existingOrders = selected.supplierOrders ?? [selected];
      const createdOrders = new Map<string, ShopOrderRequest>();
      await Promise.all(lineGroups.filter((group) => group.requestId.startsWith("draft-supplier-")).map(async (lineGroup) => {
        const draftOrder = existingOrders.find((order) => order.id === lineGroup.requestId);
        if (!draftOrder || !selected.batchId) throw new Error("Missing supplier order batch");
        const supplierCatalog = catalog.filter((item) =>
          item.channel === draftOrder.channel
          && item.supplierName === draftOrder.catalogSupplierName
          && item.fccSupplierId === draftOrder.supplierId,
        );
        const created = await createShopOrderRequest({
          batchId: selected.batchId,
          restaurantId: selected.restaurantId,
          channel: draftOrder.channel,
          supplierId: draftOrder.supplierId,
          catalogSupplierName: draftOrder.catalogSupplierName,
          deliveryDate,
          note: orderNote,
          lines: lineGroup.lines,
          catalogItems: supplierCatalog,
        });
        createdOrders.set(lineGroup.requestId, created);
      }));
      const resolvedGroups = lineGroups.map((group) => ({
        ...group,
        requestId: createdOrders.get(group.requestId)?.id ?? group.requestId,
      }));
      await Promise.all(resolvedGroups.map((group) => reviewShopOrder({
        requestId: group.requestId,
        deliveryDate,
        note: orderNote,
        reviewNote,
        action,
        lines: group.lines,
      })));
      const status = action === "approve" ? "reviewed" : action === "return" ? "rejected" : "submitted";
      const resolvedDraftLines = draftLines.map((line) => ({
        ...line,
        requestId: createdOrders.get(line.requestId)?.id ?? line.requestId,
      }));
      const resolvedOrders = existingOrders.map((order) => createdOrders.get(order.id) ?? order);
      const updatedOrders = resolvedOrders.map((order) => {
        if (order.channel !== "fc_internal") return order;
        const lines = resolvedDraftLines.filter((line) => line.requestId === order.id);
        return {
          ...order,
          deliveryDate,
          note: orderNote.trim() || null,
          status,
          lines: lines.map((line, index) => ({
            id: order.lines[index]?.id ?? `draft-${line.catalogItemId}`,
            catalogItemId: line.catalogItemId,
            name: line.name,
            unit: line.unit,
            sku: line.sku,
            quantity: Number(line.quantity),
            warehouse: line.warehouse,
          })),
        };
      });
      const updatedPrimary = updatedOrders.find((order) => order.id === selected.id) ?? selected;
      const updated: ShopOrderRequest = {
        ...updatedPrimary,
        shippingMethodId,
        shippingMethodName: shippingMethods.find((method) => method.id === shippingMethodId)?.name ?? null,
        deliveryContactPerson: contactPerson.trim() || null,
        deliveryPhone: deliveryPhone.trim() || null,
        deliveryAddress: deliveryAddress.trim() || null,
        supplierOrders: updatedOrders,
      };
      setSelected(updated);
      setDraftLines(resolvedDraftLines);
      const updatesById = new Map(updatedOrders.map((order) => [order.id, order]));
      setRows((current) => {
        const updatedRows = current.map((item) => updatesById.get(item.id) ?? item);
        const knownIds = new Set(updatedRows.map((item) => item.id));
        return [...updatedRows, ...updatedOrders.filter((order) => !knownIds.has(order.id))];
      });
      setMessage({
        tone: "success",
        text: t(action === "approve"
          ? "shopOrdering.approved"
          : action === "return"
            ? "shopOrdering.returned"
            : "shopOrdering.reviewSaved"),
      });
      void Promise.all(updatedOrders.map((order) => fetchShopOrderEvents(order.id)))
        .then((groups) => setEvents(groups.flat().sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )))
        .catch(() => undefined);
    } catch {
      setMessage({ tone: "error", text: t("shopOrdering.reviewSaveError") });
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!selected || !allActionableReviewed) return;
    setBusy("send");
    setMessage(null);
    try {
      await Promise.all(actionableOrders.map((order) => sendShopOrderToFactory(order.id)));
      const sentIds = new Set(actionableOrders.map((order) => order.id));
      const updatedOrders = (selected.supplierOrders ?? [selected]).map((order) =>
        sentIds.has(order.id) ? { ...order, status: "in_transit" } : order,
      );
      const updatedPrimary = updatedOrders.find((order) => order.id === selected.id) ?? selected;
      setSelected({ ...updatedPrimary, supplierOrders: updatedOrders });
      setRows((current) => current.map((item) =>
        sentIds.has(item.id) ? { ...item, status: "in_transit" } : item,
      ));
      setMessage({ tone: "success", text: t("shopOrdering.sentFactory") });
      void Promise.all(updatedOrders.map((order) => fetchShopOrderEvents(order.id)))
        .then((groups) => setEvents(groups.flat().sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )))
        .catch(() => undefined);
    } catch {
      setMessage({ tone: "error", text: t("shopOrdering.sendFactoryError") });
    } finally {
      setBusy(null);
    }
  };

  if (!selected) {
    return (
      <section className="ingredients-page office-shop-page">
        <OfficeShopHeading title={t("shopOrdering.reviewTitle")} description={t("shopOrdering.reviewDescription")} />
        <article className="panel ingredients-panel">
          {error ? <LoadError onRetry={load} /> : (
            <RestaurantSettingsListTable
              loading={loading}
              loadingLabel={t("shopOrdering.loading")}
              skeletonColumns={7}
              searchPlaceholder={t("shopOrdering.searchRequests")}
              emptyTitle={t("shopOrdering.emptyReview")}
              header={<tr><th>{t("shopOrdering.columns.number")}</th><th>{t("shopOrdering.restaurant")}</th><th>{t("shopOrdering.columns.supplier")}</th><th>{t("shopOrdering.columns.deliveryDate")}</th><th>{t("shopOrdering.columns.itemCount")}</th><th>{t("shopOrdering.columns.status")}</th><th aria-label={t("shopOrdering.columns.actions")} /></tr>}
            >
              {groupedRows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.requestNo}</strong></td>
                  <td>{row.restaurantName ?? "—"}</td>
                  <td>{[...new Set((row.supplierOrders ?? [row]).map((item) => item.catalogSupplierName))].join("、")}</td>
                  <td>{row.deliveryDate}</td>
                  <td>{row.lines.length}</td>
                  <td><ShopStatus status={row.status} /></td>
                  <td className="table-actions-cell"><div className="table-row-actions"><Button size="sm" variant="outline" onClick={() => openReview(row)}><Eye />{t("shopOrdering.reviewAction")}</Button></div></td>
                </tr>
              ))}
            </RestaurantSettingsListTable>
          )}
        </article>
      </section>
    );
  }

  const totalQuantity = draftLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const selectedSupplierOrders = selected.supplierOrders ?? [selected];
  const supplierNames = [...new Set(selectedSupplierOrders.map((order) => order.catalogSupplierName))].join("、");
  return (
    <section className="ingredients-page order-editor-page office-shop-page office-shop-review-page office-review-order-editor">
      <header className="order-editor-header office-review-header">
        <div className="order-editor-title">
          <Button type="button" variant="ghost" size="icon" aria-label={t("shopOrdering.backToOrders")} onClick={closeOrder}><ArrowLeft /></Button>
          <div><span className="eyebrow">{t("shopOrdering.reviewTitle")}</span><h1>{selected.requestNo}</h1><p>{selected.restaurantName ?? "—"} · {supplierNames}</p></div>
        </div>
        <div className="office-review-header-controls">
          {canActOnSelected ? <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void runReviewAction("save")}><Save />{t(busy === "save" ? "shopOrdering.savingChanges" : "shopOrdering.saveChanges")}</Button> : null}
          {canActOnSelected ? <Button type="button" variant="destructive" disabled={Boolean(busy)} onClick={() => void runReviewAction("return")}><RotateCcw />{t(busy === "return" ? "shopOrdering.returning" : "shopOrdering.returnOrder")}</Button> : null}
          {canActOnSelected && !allActionableReviewed ? <Button type="button" disabled={Boolean(busy)} onClick={() => void runReviewAction("approve")}><Check />{t(busy === "approve" ? "shopOrdering.approving" : "shopOrdering.approveOrder")}</Button> : null}
          {canActOnSelected && canSend && allActionableReviewed ? <Button type="button" disabled={Boolean(busy)} onClick={() => void send()}><Send />{t(busy === "send" ? "shopOrdering.sendingFactory" : "shopOrdering.sendFactory")}</Button> : null}
        </div>
      </header>

      <AlertDialog
        open={Boolean(message)}
        title={t("common.notifications")}
        message={message?.text ?? ""}
        tone={message?.tone}
        confirmLabel={t("common.confirm")}
        closeLabel={t("common.close")}
        onClose={() => setMessage(null)}
      />

      <nav className="order-editor-steps" aria-label={t("shopOrdering.reviewTitle")}>
        {([
          { id: "details", icon: ClipboardList, label: t("shopOrdering.orderDetails") },
          { id: "items", icon: PackagePlus, label: t("shopOrdering.orderItems") },
          { id: "decision", icon: Check, label: t("shopOrdering.reviewDecision") },
        ] as const).map((step, index) => {
          const Icon = step.icon;
          return <button key={step.id} type="button" aria-current={activeStep === step.id ? "location" : undefined} className={activeStep === step.id ? "active" : ""} onClick={() => scrollToStep(step.id)}><span><Icon /></span><small>{t("shopOrdering.reviewStep", { step: index + 1 })}</small><strong>{step.label}</strong></button>;
        })}
      </nav>

      <div className="office-review-workspace">
        <main className="office-review-main">
          <article id="office-review-details" data-review-step="details" className="office-review-card office-review-scroll-section">
            <header><div><h2>{t("shopOrdering.orderDetails")}</h2><p>{t("shopOrdering.orderDetailsHint")}</p></div><Pencil aria-hidden="true" /></header>
            <div className="office-review-fields">
              <label><span>{t("shopOrdering.restaurant")}</span><input value={selected.restaurantName ?? ""} readOnly /></label>
              <label><span>{t("shopOrdering.supplier")}</span><input value={supplierNames} readOnly /></label>
              <label><span>{t("shopOrdering.deliveryDate")}</span><input type="date" value={deliveryDate} disabled={Boolean(busy) || !canActOnSelected} onChange={(event) => setDeliveryDate(event.target.value)} /></label>
              <label><span>{t("shopOrdering.shippingMethod")}</span><FilterableSelect aria-label={t("shopOrdering.shippingMethod")} value={shippingMethodId} disabled={Boolean(busy) || !canActOnSelected} onChange={(event) => setShippingMethodId(event.target.value)}><option value="">{t("shopOrdering.shippingMethodPlaceholder")}</option>{shippingMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</FilterableSelect></label>
              <label><span>{t("shopOrdering.deliveryContact")}</span><input value={contactPerson} disabled={Boolean(busy) || !canActOnSelected} onChange={(event) => setContactPerson(event.target.value)} /></label>
              <label><span>{t("shopOrdering.deliveryPhone")}</span><input inputMode="tel" value={deliveryPhone} disabled={Boolean(busy) || !canActOnSelected} onChange={(event) => setDeliveryPhone(event.target.value)} /></label>
              <label className="is-wide"><span>{t("shopOrdering.deliveryAddress")}</span><textarea rows={2} value={deliveryAddress} disabled={Boolean(busy) || !canActOnSelected} onChange={(event) => setDeliveryAddress(event.target.value)} /></label>
              <label className="is-wide"><span>{t("shopOrdering.note")}</span><textarea rows={3} value={orderNote} disabled={Boolean(busy) || !canActOnSelected} placeholder={t("shopOrdering.orderNotePlaceholder")} onChange={(event) => setOrderNote(event.target.value)} /></label>
            </div>
          </article>

          <article id="office-review-items" data-review-step="items" className="office-review-card office-review-lines-card office-review-scroll-section">
            <header><div><h2>{t("shopOrdering.orderItems")}</h2><p>{t("shopOrdering.editLinesHint")}</p></div><span>{t("shopOrdering.itemCountValue", { count: draftLines.length })}</span></header>
            {canActOnSelected && selected.batchId && availableSupplierGroups.length ? <div className="office-review-add-line office-review-add-supplier">
              <div className="office-review-product-select"><SearchSelect id="office-review-add-supplier" label={t("shopOrdering.addSupplier")} value={supplierToAdd} disabled={Boolean(busy)} options={availableSupplierGroups.map((group) => ({ id: shopCatalogSupplierKey(group), name: group.supplierName }))} placeholder={t("shopOrdering.supplierPickerPlaceholder")} searchPlaceholder={t("shopOrdering.supplierSearchPlaceholder")} onChange={(option) => setSupplierToAdd(option.id)} /></div>
              <Button type="button" variant="outline" disabled={!supplierToAdd || Boolean(busy)} onClick={addSupplier}><Plus />{t("shopOrdering.addSupplier")}</Button>
            </div> : null}
            <div className="office-review-add-line">
              <div className="office-review-product-select"><SearchSelect id="office-review-add-product" label={t("shopOrdering.addProduct")} value={productToAdd} disabled={Boolean(busy) || !canActOnSelected || !availableProducts.length} options={availableProducts.map((item) => ({ id: item.id, name: `${item.supplierName} · ${item.sku ? `${item.sku} · ` : ""}${item.name} (${item.unit})` }))} placeholder={t("shopOrdering.chooseProductPlaceholder")} searchPlaceholder={t("shopOrdering.searchItemsPlaceholder")} onChange={(option) => setProductToAdd(option.id)} /></div>
              <Button type="button" variant="outline" disabled={!productToAdd || Boolean(busy) || !canActOnSelected} onClick={addProduct}><PackagePlus />{t("shopOrdering.addProduct")}</Button>
            </div>
            <div className="office-review-lines">
              {selectedSupplierOrders.map((order) => {
                const supplierLines = draftLines.filter((line) => line.requestId === order.id);
                const editable = order.channel === "fc_internal" && canActOnSelected;
                return <section className="office-review-supplier-group" key={order.id} aria-label={order.catalogSupplierName}>
                  <header><strong>{order.catalogSupplierName}</strong><span><ShopStatus status={order.status} />{supplierLines.length} {t("shopOrdering.columns.itemCount")}{order.id.startsWith("draft-supplier-") ? <Button type="button" variant="ghost" size="icon" disabled={Boolean(busy)} aria-label={t("shopOrdering.removeSupplier", { supplier: order.catalogSupplierName })} onClick={() => removeDraftSupplier(order.id)}><Trash2 /></Button> : null}</span></header>
                  <div className="office-review-lines-heading"><span>{t("shopOrdering.item")}</span><span>{t("shopOrdering.unit")}</span><span>{t("shopOrdering.quantity")}</span><span aria-hidden="true" /></div>
                  {supplierLines.map((line) => (
                    <div className="office-review-line" key={`${line.requestId}-${line.catalogItemId}`}>
                      <div><strong>{line.name}</strong><small>{[line.sku, line.warehouse ? t(`shopOrdering.warehouse.${line.warehouse}`) : ""].filter(Boolean).join(" · ")}</small></div>
                      <span>{line.unit}</span>
                      <input aria-label={t("shopOrdering.editQuantity", { item: line.name })} type="number" min="0.01" step="any" value={line.quantity} disabled={Boolean(busy) || !editable} onChange={(event) => setDraftLines((current) => current.map((item) => item.requestId === line.requestId && item.catalogItemId === line.catalogItemId ? { ...item, quantity: event.target.value } : item))} />
                      {editable ? <Button type="button" variant="ghost" size="icon" disabled={Boolean(busy)} aria-label={t("shopOrdering.removeItem", { item: line.name })} onClick={() => setDraftLines((current) => current.filter((item) => item.requestId !== line.requestId || item.catalogItemId !== line.catalogItemId))}><Trash2 /></Button> : <span aria-hidden="true" />}
                    </div>
                  ))}
                </section>;
              })}
            </div>
          </article>
        </main>

        <aside id="office-review-decision" data-review-step="decision" className="office-review-aside office-review-scroll-section">
          <article className="office-review-card office-review-decision">
            <header><div><h2>{t("shopOrdering.reviewDecision")}</h2><p>{t("shopOrdering.reviewDecisionHint")}</p></div><ShieldCheck aria-hidden="true" /></header>
            <dl>
              <div><dt>{t("shopOrdering.columns.status")}</dt><dd><ShopStatus status={selected.status} /></dd></div>
              <div><dt>{t("shopOrdering.orderTotal")}</dt><dd>{t("shopOrdering.orderTotalValue", { items: draftLines.length, quantity: totalQuantity })}</dd></div>
              <div><dt>{t("shopOrdering.createdAt")}</dt><dd>{formatReviewDateTime(selected.createdAt)}</dd></div>
            </dl>
            <label className="office-review-note"><span>{t("shopOrdering.reviewNote")}</span><textarea rows={5} value={reviewNote} disabled={Boolean(busy) || !canActOnSelected} placeholder={t("shopOrdering.reviewNotePlaceholder")} onChange={(event) => setReviewNote(event.target.value)} /><small>{t("shopOrdering.returnReasonHint")}</small></label>
          </article>

          <article className="office-review-card office-review-history">
            <header><div><h2>{t("shopOrdering.activityHistory")}</h2><p>{t("shopOrdering.activityHistoryHint")}</p></div><Clock3 aria-hidden="true" /></header>
            <ol>
              {events.length ? events.map((event) => <li key={event.id}><span><Clock3 /></span><div><strong>{t(`shopOrdering.events.${event.eventType === "order_created" ? "created" : event.eventType}`, { defaultValue: event.eventType })}</strong>{event.payload.supplierName ? <p>{String(event.payload.supplierName)}</p> : null}{event.payload.reviewNote ? <p>{String(event.payload.reviewNote)}</p> : null}<time dateTime={event.createdAt}>{formatReviewDateTime(event.createdAt)}</time></div></li>) : <li><span><PackagePlus /></span><div><strong>{t("shopOrdering.events.created")}</strong><time dateTime={selected.createdAt}>{formatReviewDateTime(selected.createdAt)}</time></div></li>}
            </ol>
          </article>
        </aside>
      </div>

    </section>
  );
}

export function OfficeShopRecordsPage() {
  return <ShopOrderRecordsPage office />;
}
