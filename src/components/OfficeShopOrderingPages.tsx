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
import { OperationalListState } from "@/components/ui/operational-list-state";
import { RestaurantSettingsListTable } from "@/components/ui/restaurant-settings-list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { SearchSelect } from "@/components/ui/search-select";
import { ShopOrderRecordsPage } from "@/components/ShopOrderRecordsPage";
import { SuppliersPage } from "@/components/SuppliersPage";
import {
  createShopSupplierContact,
  fetchAllShopContacts,
  fetchShopCatalog,
  fetchShopOrderEvents,
  fetchShopSupplierRecords,
  fetchShopOrderRequests,
  reviewShopOrder,
  sendShopOrderToFactory,
  updateShopSupplierContact,
  updateShopOrderLines,
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
  catalogItemId: string;
  name: string;
  unit: string;
  sku: string | null;
  warehouse: ShopOrderRequest["lines"][number]["warehouse"];
  quantity: string;
};

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
  const [reviewNote, setReviewNote] = useState("");
  const [events, setEvents] = useState<ShopOrderEvent[]>([]);
  const [productToAdd, setProductToAdd] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<"save" | "approve" | "return" | "send" | null>(null);
  const [activeStep, setActiveStep] = useState<"details" | "items" | "decision">("details");

  const showOrder = useCallback((row: ShopOrderRequest) => {
    setSelected(row);
    setDeliveryDate(row.deliveryDate);
    setOrderNote(row.note ?? "");
    setReviewNote("");
    setProductToAdd("");
    setMessage(null);
    setActiveStep("details");
    setEvents([]);
    setDraftLines(row.lines.map((line) => ({
      catalogItemId: line.catalogItemId ?? `legacy-${line.id}`,
      name: line.name,
      unit: line.unit,
      sku: line.sku,
      warehouse: line.warehouse,
      quantity: String(line.quantity),
    })));
    void fetchShopOrderEvents(row.id).then(setEvents).catch(() => setEvents([]));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    void Promise.all([
      fetchShopOrderRequests(requestId ? { requestId } : { channel: "fc_internal" }),
      fetchShopCatalog(),
    ]).then(([requests, products]) => {
      setCatalog(products);
      if (requestId) {
        const requested = requests.find((row) => row.id === requestId);
        if (!requested) {
          setError(true);
          return;
        }
        showOrder(requested);
      } else {
        setSelected(null);
        setRows(requests.filter((row) => ["submitted", "reviewed"].includes(row.status)));
      }
    }).catch(() => setError(true)).finally(() => setLoading(false));
  }, [requestId, showOrder]);
  useEffect(load, [load]);

  const openReview = (row: ShopOrderRequest) => {
    navigate(orderWorkspacePath(row.id, "review"));
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
    return catalog.filter((item) =>
      item.supplierName === selected.catalogSupplierName
      && item.fccSupplierId === selected.supplierId
      && !selectedIds.has(item.id),
    );
  }, [catalog, draftLines, selected]);

  const canActOnSelected = Boolean(
    canReview &&
      selected?.channel === "fc_internal" &&
      ["submitted", "reviewed"].includes(selected.status) &&
      selected.lines.every((line) => Boolean(line.catalogItemId)),
  );

  const addProduct = () => {
    const item = catalog.find((candidate) => candidate.id === productToAdd);
    if (!item) return;
    setDraftLines((current) => [...current, {
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
    const lines = draftLines.map((line) => ({
      catalogItemId: line.catalogItemId,
      quantity: Number(line.quantity),
    }));
    if (!lines.length) {
      setMessage({ tone: "error", text: t("shopOrdering.needLines") });
      return null;
    }
    if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) {
      setMessage({ tone: "error", text: t("shopOrdering.quantityInvalid") });
      return null;
    }
    if (!deliveryDate) {
      setMessage({ tone: "error", text: t("shopOrdering.deliveryDateInvalid") });
      return null;
    }
    return lines;
  };

  const runReviewAction = async (action: "save" | "approve" | "return") => {
    if (!selected) return;
    const lines = getValidLines();
    if (!lines) return;
    if (action === "return" && !reviewNote.trim()) {
      setActiveStep("decision");
      setMessage({ tone: "error", text: t("shopOrdering.returnReasonRequired") });
      return;
    }
    setBusy(action);
    setMessage(null);
    try {
      await reviewShopOrder({
        requestId: selected.id,
        deliveryDate,
        note: orderNote,
        reviewNote,
        action,
        lines,
      });
      if (action === "return") {
        setRows((current) => current.filter((item) => item.id !== selected.id));
        closeOrder();
        return;
      }
      const status = action === "approve" ? "reviewed" : "submitted";
      const updated: ShopOrderRequest = {
        ...selected,
        deliveryDate,
        note: orderNote.trim() || null,
        status,
        lines: draftLines.map((line, index) => ({
          id: selected.lines[index]?.id ?? `draft-${line.catalogItemId}`,
          catalogItemId: line.catalogItemId,
          name: line.name,
          unit: line.unit,
          sku: line.sku,
          quantity: Number(line.quantity),
          warehouse: line.warehouse,
        })),
      };
      setSelected(updated);
      setRows((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMessage({
        tone: "success",
        text: t(action === "approve" ? "shopOrdering.approved" : "shopOrdering.reviewSaved"),
      });
      void fetchShopOrderEvents(selected.id).then(setEvents).catch(() => undefined);
    } catch {
      setMessage({ tone: "error", text: t("shopOrdering.reviewSaveError") });
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!selected || selected.status !== "reviewed") return;
    setBusy("send");
    setMessage(null);
    try {
      await sendShopOrderToFactory(selected.id);
      setRows((current) => current.filter((item) => item.id !== selected.id));
      closeOrder();
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
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.requestNo}</strong></td>
                  <td>{row.restaurantName ?? "—"}</td>
                  <td>{row.catalogSupplierName}</td>
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
  return (
    <section className="ingredients-page order-editor-page office-shop-page office-shop-review-page office-review-order-editor">
      <header className="order-editor-header office-review-header">
        <div className="order-editor-title">
          <Button type="button" variant="ghost" size="icon" aria-label={t("shopOrdering.backToOrders")} onClick={closeOrder}><ArrowLeft /></Button>
          <div><span className="eyebrow">{t("shopOrdering.reviewTitle")}</span><h1>{selected.requestNo}</h1><p>{selected.restaurantName ?? "—"} · {selected.catalogSupplierName}</p></div>
        </div>
        <div className="office-review-header-controls">
          {canActOnSelected ? <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void runReviewAction("save")}><Save />{t(busy === "save" ? "shopOrdering.savingChanges" : "shopOrdering.saveChanges")}</Button> : null}
          {canActOnSelected ? <Button type="button" variant="destructive" disabled={Boolean(busy)} onClick={() => void runReviewAction("return")}><RotateCcw />{t(busy === "return" ? "shopOrdering.returning" : "shopOrdering.returnOrder")}</Button> : null}
          {canActOnSelected && selected.status !== "reviewed" ? <Button type="button" disabled={Boolean(busy)} onClick={() => void runReviewAction("approve")}><Check />{t(busy === "approve" ? "shopOrdering.approving" : "shopOrdering.approveOrder")}</Button> : null}
          {canActOnSelected && canSend && selected.status === "reviewed" ? <Button type="button" disabled={Boolean(busy)} onClick={() => void send()}><Send />{t(busy === "send" ? "shopOrdering.sendingFactory" : "shopOrdering.sendFactory")}</Button> : null}
        </div>
      </header>

      {message ? <p className={`office-review-alert is-${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</p> : null}

      <nav className="order-editor-steps" aria-label={t("shopOrdering.reviewTitle")}>
        {([
          { id: "details", icon: ClipboardList, label: t("shopOrdering.orderDetails") },
          { id: "items", icon: PackagePlus, label: t("shopOrdering.orderItems") },
          { id: "decision", icon: Check, label: t("shopOrdering.reviewDecision") },
        ] as const).map((step, index) => {
          const Icon = step.icon;
          const activeIndex = activeStep === "details" ? 0 : activeStep === "items" ? 1 : 2;
          return <button key={step.id} type="button" aria-current={activeStep === step.id ? "step" : undefined} className={activeStep === step.id ? "active" : index < activeIndex ? "complete" : ""} onClick={() => setActiveStep(step.id)}><span>{index < activeIndex ? <Check /> : <Icon />}</span><small>{t("shopOrdering.reviewStep", { step: index + 1 })}</small><strong>{step.label}</strong></button>;
        })}
      </nav>

      <div className={`office-review-workspace is-${activeStep}`}>
        <main className="office-review-main">
          {activeStep === "details" ? <article className="office-review-card">
            <header><div><h2>{t("shopOrdering.orderDetails")}</h2><p>{t("shopOrdering.orderDetailsHint")}</p></div><Pencil aria-hidden="true" /></header>
            <div className="office-review-fields">
              <label><span>{t("shopOrdering.restaurant")}</span><input value={selected.restaurantName ?? ""} readOnly /></label>
              <label><span>{t("shopOrdering.supplier")}</span><input value={selected.catalogSupplierName} readOnly /></label>
              <label><span>{t("shopOrdering.deliveryDate")}</span><input type="date" value={deliveryDate} disabled={Boolean(busy) || !canActOnSelected} onChange={(event) => setDeliveryDate(event.target.value)} /></label>
              <label className="is-wide"><span>{t("shopOrdering.note")}</span><textarea rows={3} value={orderNote} disabled={Boolean(busy) || !canActOnSelected} placeholder={t("shopOrdering.orderNotePlaceholder")} onChange={(event) => setOrderNote(event.target.value)} /></label>
            </div>
          </article> : null}

          {activeStep === "items" ? <article className="office-review-card office-review-lines-card">
            <header><div><h2>{t("shopOrdering.orderItems")}</h2><p>{t("shopOrdering.editLinesHint")}</p></div><span>{t("shopOrdering.itemCountValue", { count: draftLines.length })}</span></header>
            <div className="office-review-add-line">
              <div className="office-review-product-select"><SearchSelect id="office-review-add-product" label={t("shopOrdering.addProduct")} value={productToAdd} disabled={Boolean(busy) || !canActOnSelected || !availableProducts.length} options={availableProducts.map((item) => ({ id: item.id, name: `${item.sku ? `${item.sku} · ` : ""}${item.name} (${item.unit})` }))} placeholder={t("shopOrdering.chooseProductPlaceholder")} searchPlaceholder={t("shopOrdering.searchItemsPlaceholder")} onChange={(option) => setProductToAdd(option.id)} /></div>
              <Button type="button" variant="outline" disabled={!productToAdd || Boolean(busy) || !canActOnSelected} onClick={addProduct}><PackagePlus />{t("shopOrdering.addProduct")}</Button>
            </div>
            <div className="office-review-lines">
              <div className="office-review-lines-heading"><span>{t("shopOrdering.item")}</span><span>{t("shopOrdering.unit")}</span><span>{t("shopOrdering.quantity")}</span><span aria-hidden="true" /></div>
              {draftLines.map((line) => (
                <div className="office-review-line" key={line.catalogItemId}>
                  <div><strong>{line.name}</strong><small>{[line.sku, line.warehouse ? t(`shopOrdering.warehouse.${line.warehouse}`) : ""].filter(Boolean).join(" · ")}</small></div>
                  <span>{line.unit}</span>
                  <input aria-label={t("shopOrdering.editQuantity", { item: line.name })} type="number" min="0.01" step="any" value={line.quantity} disabled={Boolean(busy) || !canActOnSelected} onChange={(event) => setDraftLines((current) => current.map((item) => item.catalogItemId === line.catalogItemId ? { ...item, quantity: event.target.value } : item))} />
                  <Button type="button" variant="ghost" size="icon" disabled={Boolean(busy) || !canActOnSelected} aria-label={t("shopOrdering.removeItem", { item: line.name })} onClick={() => setDraftLines((current) => current.filter((item) => item.catalogItemId !== line.catalogItemId))}><Trash2 /></Button>
                </div>
              ))}
            </div>
          </article> : null}
        </main>

        {activeStep === "decision" ? <aside className="office-review-aside">
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
              {events.map((event) => <li key={event.id}><span><Clock3 /></span><div><strong>{t(`shopOrdering.events.${event.eventType}`, { defaultValue: event.eventType })}</strong>{event.payload.reviewNote ? <p>{String(event.payload.reviewNote)}</p> : null}<time dateTime={event.createdAt}>{formatReviewDateTime(event.createdAt)}</time></div></li>)}
              <li><span><PackagePlus /></span><div><strong>{t("shopOrdering.events.created")}</strong><time dateTime={selected.createdAt}>{formatReviewDateTime(selected.createdAt)}</time></div></li>
            </ol>
          </article>
        </aside> : null}
      </div>

    </section>
  );
}

export function OfficeShopRecordsPage() {
  return <ShopOrderRecordsPage office />;
}
