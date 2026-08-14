import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  PreparedMeatItemSearchSelect,
  PreparedMeatQuantityInput,
} from "@/components/prepared-meat-line-controls";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import { fetchMeatCustomers, type MeatCustomerRow } from "@/lib/meat-customers";
import {
  canSelectPreparedMeatShippingMethod,
  canShipRawMeatOnPreparedOutbound,
  coercePreparedMeatQuantityInput,
  createPreparedMeatOutbound,
  fetchDirectShipRawMeatItems,
  fetchMeatShippingMethods,
  fetchNextPreparedMeatOrderNumber,
  fetchPreparedMeatOutboundOrder,
  fetchPreparedMeatOutboundStockBalances,
  formatPreparedMeatStock,
  meatCustomerOptionLabel,
  remainingPreparedMeatOutboundStock,
  sendPreparedMeatOrderToFactory,
  updatePreparedMeatOutbound,
  type DirectShipRawMeatOption,
  type MeatShippingMethodOption,
  type PreparedMeatItemOption,
  type PreparedMeatOutboundInput,
  type PreparedMeatOutboundOrder,
  type PreparedMeatOutboundStockBalances,
} from "@/lib/prepared-meat-inventory";
import { hongKongDateInputValue } from "@/lib/raw-meat-inventory";

type DraftLine = {
  key: string;
  kind: "prepared" | "raw";
  itemId: string;
  sku: string | null;
  name: string;
  unit: string | null;
  quantity: number;
  remarks: string;
};

type CustomersLoader = () => Promise<MeatCustomerRow[]>;
type ShippingLoader = () => Promise<MeatShippingMethodOption[]>;
type OrderNumberLoader = (shippingDate: string) => Promise<string>;
type RawItemsLoader = () => Promise<DirectShipRawMeatOption[]>;
type StockLoader = () => Promise<PreparedMeatOutboundStockBalances>;
type OutboundLoader = (orderId: string) => Promise<PreparedMeatOutboundOrder>;
type OutboundCreator = (input: PreparedMeatOutboundInput) => Promise<string>;
type OutboundUpdater = (
  input: PreparedMeatOutboundInput & { orderId: string },
) => Promise<string>;
type FactorySender = (orderId: string) => Promise<string>;

function parseQuantity(value: string) {
  const parsed = Number.parseFloat(coercePreparedMeatQuantityInput(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function orderDateInputValue(value: string | null) {
  if (!value) return hongKongDateInputValue();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return hongKongDateInputValue();
  return hongKongDateInputValue(date);
}

function stockKey(kind: DraftLine["kind"], itemId: string) {
  return `${kind}:${itemId}`;
}

function sumQuantitiesByItem(
  rows: Array<{ kind: DraftLine["kind"]; itemId: string; quantity: number }>,
) {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    const key = stockKey(row.kind, row.itemId);
    totals[key] = (totals[key] ?? 0) + row.quantity;
  }
  return totals;
}

export function PreparedMeatOutboundModal({
  open,
  orderId,
  items,
  onClose,
  onSaved,
  loadCustomers = fetchMeatCustomers,
  loadShippingMethods = fetchMeatShippingMethods,
  loadOrderNumber = fetchNextPreparedMeatOrderNumber,
  loadRawItems = fetchDirectShipRawMeatItems,
  loadStock = fetchPreparedMeatOutboundStockBalances,
  loadOutbound = fetchPreparedMeatOutboundOrder,
  createOutbound = createPreparedMeatOutbound,
  updateOutbound = updatePreparedMeatOutbound,
  sendToFactory = sendPreparedMeatOrderToFactory,
}: {
  open: boolean;
  orderId?: string | null;
  items: PreparedMeatItemOption[];
  onClose: () => void;
  onSaved: () => void;
  loadCustomers?: CustomersLoader;
  loadShippingMethods?: ShippingLoader;
  loadOrderNumber?: OrderNumberLoader;
  loadRawItems?: RawItemsLoader;
  loadStock?: StockLoader;
  loadOutbound?: OutboundLoader;
  createOutbound?: OutboundCreator;
  updateOutbound?: OutboundUpdater;
  sendToFactory?: FactorySender;
}) {
  const { t } = useTranslation();
  const isEditMode = orderId !== undefined;
  const [customers, setCustomers] = useState<MeatCustomerRow[]>([]);
  const [shippingMethods, setShippingMethods] = useState<
    MeatShippingMethodOption[]
  >([]);
  const [rawItems, setRawItems] = useState<DirectShipRawMeatOption[]>([]);
  const [stock, setStock] = useState<PreparedMeatOutboundStockBalances>({
    prepared: {},
    raw: {},
  });
  const [originalQuantities, setOriginalQuantities] = useState<
    Record<string, number>
  >({});
  const [customerId, setCustomerId] = useState("");
  const [shippingMethodId, setShippingMethodId] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [shippingDate, setShippingDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [savedOrderId, setSavedOrderId] = useState<string | null>(null);
  const [sentToFactory, setSentToFactory] = useState(false);
  const [draftPreparedId, setDraftPreparedId] = useState("");
  const [draftPreparedQuantity, setDraftPreparedQuantity] = useState("");
  const [draftPreparedRemarks, setDraftPreparedRemarks] = useState("");
  const [draftRawId, setDraftRawId] = useState("");
  const [draftRawQuantity, setDraftRawQuantity] = useState("");
  const [draftRawRemarks, setDraftRawRemarks] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeItems = useMemo(
    () => items.filter((item) => item.isActive),
    [items],
  );
  const selectedCustomer =
    customers.find((row) => row.id === customerId) ?? null;
  const shippingEnabled = canSelectPreparedMeatShippingMethod(
    selectedCustomer?.name,
  );
  const rawEnabled = canShipRawMeatOnPreparedOutbound(selectedCustomer?.name);
  const locked = Boolean(savedOrderId) && !isEditMode;

  const remainingStock = (
    kind: DraftLine["kind"],
    itemId: string,
    exceptKey?: string,
  ) =>
    remainingPreparedMeatOutboundStock({
      onHand: (kind === "prepared" ? stock.prepared : stock.raw)[itemId] ?? 0,
      originalQuantity: originalQuantities[stockKey(kind, itemId)] ?? 0,
      committedQuantity: lines
        .filter(
          (line) =>
            line.kind === kind &&
            line.itemId === itemId &&
            line.key !== exceptKey,
        )
        .reduce((total, line) => total + line.quantity, 0),
    });

  const quantityError = (
    kind: DraftLine["kind"],
    itemId: string,
    quantity: number | null,
    exceptKey?: string,
  ) => {
    if (quantity === null || quantity <= 0) {
      return t("preparedMeatInventory.outbound.quantityRequired");
    }
    const remaining = remainingStock(kind, itemId, exceptKey);
    if (quantity > remaining) {
      return t("preparedMeatInventory.outbound.quantityExceedsStock", {
        stock: formatPreparedMeatStock(Math.max(0, remaining)),
      });
    }
    return null;
  };

  const canSave =
    Boolean(customerId && shippingDate && orderNumber && lines.length > 0) &&
    lines.every(
      (line) => !quantityError(line.kind, line.itemId, line.quantity, line.key),
    ) &&
    !locked &&
    !submitting &&
    !loading;

  useEffect(() => {
    if (!open) return;
    const today = hongKongDateInputValue();
    setCustomerId("");
    setShippingMethodId("");
    setShippingDate(today);
    setRemarks("");
    setContactPerson("");
    setPhone("");
    setAddress("");
    setSavedOrderId(null);
    setSentToFactory(false);
    setDraftPreparedId("");
    setDraftPreparedQuantity("");
    setDraftPreparedRemarks("");
    setDraftRawId("");
    setDraftRawQuantity("");
    setDraftRawRemarks("");
    setLines([]);
    setStock({ prepared: {}, raw: {} });
    setOriginalQuantities({});
    setError(null);
    setLoading(true);

    let cancelled = false;
    void (async () => {
      try {
        const [nextCustomers, nextMethods, nextRawItems, nextStock] =
          await Promise.all([
            loadCustomers(),
            loadShippingMethods(),
            loadRawItems(),
            loadStock(),
          ]);
        if (cancelled) return;
        setCustomers(nextCustomers);
        setShippingMethods(nextMethods);
        setRawItems(nextRawItems);
        setStock(nextStock);

        if (orderId === undefined) {
          const nextNumber = await loadOrderNumber(today);
          if (!cancelled) setOrderNumber(nextNumber);
          return;
        }

        if (!orderId) {
          setError(t("preparedMeatInventory.outbound.missingOrder"));
          return;
        }

        const order = await loadOutbound(orderId);
        if (cancelled) return;
        setSavedOrderId(order.id);
        setSentToFactory(order.sendToFactory);
        setCustomerId(order.customerId);
        setShippingMethodId(order.shippingMethodId ?? "");
        setOrderNumber(order.orderNumber);
        setShippingDate(orderDateInputValue(order.shippingAt));
        setRemarks(order.remarks);
        setContactPerson(order.contactPerson);
        setPhone(order.phone);
        setAddress(order.address);
        setLines(
          order.lines.map((line, index) => ({
            key: `${line.kind}-${line.itemId}-${index + 1}`,
            kind: line.kind,
            itemId: line.itemId,
            sku: line.sku,
            name: line.name,
            unit: line.unit,
            quantity: line.quantity,
            remarks: line.remarks,
          })),
        );
        setOriginalQuantities(sumQuantitiesByItem(order.lines));
      } catch (loadError: unknown) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("preparedMeatInventory.outbound.loadError"),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    loadCustomers,
    loadOrderNumber,
    loadOutbound,
    loadRawItems,
    loadShippingMethods,
    loadStock,
    open,
    orderId,
    t,
  ]);

  useEffect(() => {
    if (!open || !shippingDate || locked || isEditMode) return;
    let cancelled = false;
    void loadOrderNumber(shippingDate)
      .then((nextNumber) => {
        if (!cancelled) setOrderNumber(nextNumber);
      })
      .catch(() => {
        /* keep the current number if refresh fails */
      });
    return () => {
      cancelled = true;
    };
  }, [isEditMode, loadOrderNumber, locked, open, shippingDate]);

  const selectCustomer = (nextId: string) => {
    setCustomerId(nextId);
    const next = customers.find((row) => row.id === nextId);
    setContactPerson(next?.contactPerson ?? "");
    setPhone(next?.phone ?? "");
    setAddress(next?.address ?? "");
    if (!canSelectPreparedMeatShippingMethod(next?.name)) {
      setShippingMethodId("");
    }
    if (!canShipRawMeatOnPreparedOutbound(next?.name)) {
      setDraftRawId("");
      setDraftRawQuantity("");
      setDraftRawRemarks("");
      setLines((current) => current.filter((line) => line.kind !== "raw"));
    }
  };

  const addLine = (
    kind: DraftLine["kind"],
    item: PreparedMeatItemOption | DirectShipRawMeatOption | undefined,
    quantityText: string,
    lineRemarks: string,
    clear: () => void,
  ) => {
    const quantity = parseQuantity(quantityText);
    if (!item) {
      setError(t("preparedMeatInventory.outbound.productRequired"));
      return;
    }
    const invalid = quantityError(kind, item.id, quantity);
    if (invalid || quantity === null) {
      setError(invalid ?? t("preparedMeatInventory.outbound.quantityRequired"));
      return;
    }
    setLines((current) => [
      ...current,
      {
        key: `${kind}-${item.id}-${current.length + 1}`,
        kind,
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        quantity,
        remarks: lineRemarks.trim(),
      },
    ]);
    clear();
    setError(null);
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  };

  const buildPayload = (): PreparedMeatOutboundInput => ({
    customerId,
    shippingMethodId: shippingEnabled ? shippingMethodId || null : null,
    orderNumber,
    shippingDate,
    remarks,
    contactPerson,
    phone,
    address,
    lines: lines.map((line) => ({
      preparedMeatItemId: line.kind === "prepared" ? line.itemId : null,
      rawMeatItemId: line.kind === "raw" ? line.itemId : null,
      quantity: line.quantity,
      remarks: line.remarks,
    })),
  });

  const saveOutbound = async () => {
    if (!selectedCustomer || !canSave) return;
    const invalidLine = lines
      .map((line) => quantityError(line.kind, line.itemId, line.quantity, line.key))
      .find(Boolean);
    if (invalidLine) {
      setError(invalidLine);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (isEditMode && savedOrderId) {
        await updateOutbound({ ...buildPayload(), orderId: savedOrderId });
      } else {
        const createdId = await createOutbound(buildPayload());
        setSavedOrderId(createdId);
      }
      onSaved();
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t(
              isEditMode
                ? "preparedMeatInventory.outbound.updateError"
                : "preparedMeatInventory.outbound.saveError",
            ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const markSentToFactory = async () => {
    if (!savedOrderId || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendToFactory(savedOrderId);
      onSaved();
      onClose();
    } catch (sendError: unknown) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : t("preparedMeatInventory.outbound.sendError"),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t("preparedMeatInventory.outbound.title")}
      onClose={onClose}
      closeLabel={t("preparedMeatInventory.closeOptions")}
      extraWide
      footer={
        <>
          {locked ? null : (
            <Button
              type="button"
              disabled={!canSave}
              onClick={() => void saveOutbound()}
            >
              {submitting
                ? t("preparedMeatInventory.outbound.saving")
                : t("preparedMeatInventory.outbound.confirm")}
            </Button>
          )}
          {savedOrderId && !sentToFactory ? (
            <Button
              type="button"
              disabled={sending}
              onClick={() => void markSentToFactory()}
            >
              {sending
                ? t("preparedMeatInventory.outbound.saving")
                : t("preparedMeatInventory.outbound.sendToFactory")}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="prepared-meat-outbound-form">
        <div className="prepared-meat-outbound-header">
          <label className="raw-meat-field prepared-meat-outbound-customer">
            <span>{t("preparedMeatInventory.outbound.customer")}</span>
            <select
              aria-label={t("preparedMeatInventory.outbound.customer")}
              value={customerId}
              disabled={loading || locked}
              onChange={(event) => selectCustomer(event.target.value)}
            >
              <option value="">
                {t("preparedMeatInventory.outbound.customerPlaceholder")}
              </option>
              {customers.map((row) => (
                <option key={row.id} value={row.id}>
                  {meatCustomerOptionLabel(row)}
                </option>
              ))}
            </select>
          </label>
          <label className="raw-meat-field prepared-meat-outbound-order-number">
            <span>{t("preparedMeatInventory.outbound.orderNumber")}</span>
            <input
              value={orderNumber}
              disabled={loading || locked}
              onChange={(event) => setOrderNumber(event.target.value)}
              aria-label={t("preparedMeatInventory.outbound.orderNumber")}
            />
          </label>
          <label className="raw-meat-field prepared-meat-outbound-contact">
            <span>{t("preparedMeatInventory.outbound.contact")}</span>
            <input
              value={contactPerson}
              disabled={loading || locked}
              onChange={(event) => setContactPerson(event.target.value)}
              aria-label={t("preparedMeatInventory.outbound.contact")}
            />
          </label>
          <label className="raw-meat-field prepared-meat-outbound-shipping-date">
            <span>{t("preparedMeatInventory.outbound.shippingDate")}</span>
            <input
              type="date"
              value={shippingDate}
              disabled={loading || locked}
              onChange={(event) => setShippingDate(event.target.value)}
              aria-label={t("preparedMeatInventory.outbound.shippingDate")}
            />
          </label>
          <label className="raw-meat-field prepared-meat-outbound-phone">
            <span>{t("preparedMeatInventory.outbound.phone")}</span>
            <input
              value={phone}
              disabled={loading || locked}
              onChange={(event) => setPhone(event.target.value)}
              aria-label={t("preparedMeatInventory.outbound.phone")}
            />
          </label>
          <label className="raw-meat-field prepared-meat-outbound-shipping-method">
            <span>{t("preparedMeatInventory.outbound.shippingMethod")}</span>
            <select
              aria-label={t("preparedMeatInventory.outbound.shippingMethod")}
              value={shippingMethodId}
              disabled={!shippingEnabled || loading || locked}
              onChange={(event) => setShippingMethodId(event.target.value)}
            >
              <option value="">
                {t("preparedMeatInventory.outbound.shippingMethodPlaceholder")}
              </option>
              {shippingMethods.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="raw-meat-field prepared-meat-outbound-address">
            <span>{t("preparedMeatInventory.outbound.address")}</span>
            <textarea
              rows={3}
              value={address}
              disabled={loading || locked}
              onChange={(event) => setAddress(event.target.value)}
              aria-label={t("preparedMeatInventory.outbound.address")}
            />
          </label>
          <label className="raw-meat-field prepared-meat-outbound-remarks">
            <span>{t("preparedMeatInventory.outbound.remarks")}</span>
            <textarea
              rows={3}
              value={remarks}
              disabled={loading || locked}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder={t("preparedMeatInventory.outbound.remarksPlaceholder")}
              aria-label={t("preparedMeatInventory.outbound.remarks")}
            />
          </label>
        </div>

        <div className="prepared-meat-outbound-add-rows">
          {rawEnabled ? (
            <div className="prepared-meat-outbound-add-row">
              <div className="raw-meat-field">
                <PreparedMeatItemSearchSelect
                  label={t("preparedMeatInventory.outbound.rawProduct")}
                  placeholder={t("preparedMeatInventory.outbound.rawProductPlaceholder")}
                  value={draftRawId}
                  options={rawItems}
                  disabled={locked || loading}
                  onChange={setDraftRawId}
                />
              </div>
              <div className="raw-meat-field">
                <PreparedMeatQuantityInput
                  value={draftRawQuantity}
                  onChange={setDraftRawQuantity}
                  disabled={locked}
                  placeholder={t("preparedMeatInventory.outbound.quantityPlaceholder")}
                  ariaLabel={t("preparedMeatInventory.outbound.rawQuantity")}
                />
              </div>
              <div className="raw-meat-field">
                <input
                  value={draftRawRemarks}
                  disabled={locked}
                  onChange={(event) => setDraftRawRemarks(event.target.value)}
                  placeholder={t(
                    "preparedMeatInventory.outbound.lineRemarksPlaceholder",
                  )}
                  aria-label={t("preparedMeatInventory.outbound.rawRemarks")}
                />
              </div>
              <Button
                type="button"
                disabled={locked}
                onClick={() =>
                  addLine(
                    "raw",
                    rawItems.find((item) => item.id === draftRawId),
                    draftRawQuantity,
                    draftRawRemarks,
                    () => {
                      setDraftRawQuantity("");
                      setDraftRawRemarks("");
                    },
                  )
                }
              >
                {t("preparedMeatInventory.outbound.add")}
              </Button>
            </div>
          ) : null}

          <div className="prepared-meat-outbound-add-row">
            <div className="raw-meat-field">
              <PreparedMeatItemSearchSelect
                label={t("preparedMeatInventory.outbound.preparedProduct")}
                placeholder={t("preparedMeatInventory.outbound.preparedProductPlaceholder")}
                value={draftPreparedId}
                options={activeItems}
                disabled={locked || loading}
                onChange={setDraftPreparedId}
              />
            </div>
            <div className="raw-meat-field">
              <PreparedMeatQuantityInput
                value={draftPreparedQuantity}
                onChange={setDraftPreparedQuantity}
                disabled={locked}
                placeholder={t("preparedMeatInventory.outbound.quantityPlaceholder")}
                ariaLabel={t("preparedMeatInventory.outbound.preparedQuantity")}
              />
            </div>
            <div className="raw-meat-field">
              <input
                value={draftPreparedRemarks}
                disabled={locked}
                onChange={(event) =>
                  setDraftPreparedRemarks(event.target.value)
                }
                placeholder={t(
                  "preparedMeatInventory.outbound.lineRemarksPlaceholder",
                )}
                aria-label={t("preparedMeatInventory.outbound.preparedRemarks")}
              />
            </div>
            <Button
              type="button"
              disabled={locked}
              onClick={() =>
                addLine(
                  "prepared",
                  activeItems.find((item) => item.id === draftPreparedId),
                  draftPreparedQuantity,
                  draftPreparedRemarks,
                  () => {
                    setDraftPreparedQuantity("");
                    setDraftPreparedRemarks("");
                  },
                )
              }
            >
              {t("preparedMeatInventory.outbound.add")}
            </Button>
          </div>
        </div>

        <div className="prepared-meat-outbound-lines-wrap">
          <table className="prepared-meat-outbound-lines">
            <thead>
              <tr>
                <th>{t("preparedMeatInventory.outbound.columns.index")}</th>
                <th>{t("preparedMeatInventory.outbound.columns.sku")}</th>
                <th>{t("preparedMeatInventory.outbound.columns.name")}</th>
                <th>{t("preparedMeatInventory.outbound.columns.quantity")}</th>
                <th>{t("preparedMeatInventory.outbound.columns.unit")}</th>
                <th>{t("preparedMeatInventory.outbound.columns.remarks")}</th>
                <th>{t("preparedMeatInventory.outbound.columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    {t("preparedMeatInventory.outbound.emptyLines")}
                  </td>
                </tr>
              ) : (
                lines.map((line, index) => (
                  <tr key={line.key}>
                    <td>{index + 1}</td>
                    <td>{line.sku || t("common.notSet")}</td>
                    <td>{line.name}</td>
                    <td>
                      {locked ? (
                        line.quantity
                      ) : (
                        <PreparedMeatQuantityInput
                          value={line.quantity > 0 ? String(line.quantity) : ""}
                          onChange={(value) => {
                            const quantity = parseQuantity(value);
                            const next =
                              quantity && quantity > 0 ? quantity : 0;
                            if (next > 0) {
                              const invalid = quantityError(
                                line.kind,
                                line.itemId,
                                next,
                                line.key,
                              );
                              if (invalid) {
                                setError(invalid);
                                return;
                              }
                            }
                            updateLine(line.key, { quantity: next });
                            setError(null);
                          }}
                          placeholder={t(
                            "preparedMeatInventory.outbound.quantityPlaceholder",
                          )}
                          ariaLabel={`${line.name} ${t("preparedMeatInventory.outbound.quantity")}`}
                        />
                      )}
                    </td>
                    <td>{line.unit || t("common.notSet")}</td>
                    <td>
                      {locked ? (
                        line.remarks || t("common.notSet")
                      ) : (
                        <input
                          value={line.remarks}
                          onChange={(event) =>
                            updateLine(line.key, {
                              remarks: event.target.value,
                            })
                          }
                          placeholder={t(
                            "preparedMeatInventory.outbound.lineRemarksPlaceholder",
                          )}
                          aria-label={`${line.name} ${t("preparedMeatInventory.outbound.lineRemarks")}`}
                        />
                      )}
                    </td>
                    <td>
                      {locked ? null : (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            setLines((current) =>
                              current.filter((row) => row.key !== line.key),
                            )
                          }
                          aria-label={`${t("preparedMeatInventory.outbound.removeLine")} ${line.name}`}
                        >
                          {t("preparedMeatInventory.outbound.removeLine")}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {error ? (
          <p className="raw-meat-form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </SidePanel>
  );
}
