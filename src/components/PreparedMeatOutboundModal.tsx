import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import { fetchMeatCustomers, type MeatCustomerRow } from "@/lib/meat-customers";
import {
  canSelectPreparedMeatShippingMethod,
  coercePreparedMeatQuantityInput,
  createPreparedMeatOutbound,
  fetchMeatShippingMethods,
  fetchNextPreparedMeatOrderNumber,
  meatCustomerOptionLabel,
  type MeatShippingMethodOption,
  type PreparedMeatItemOption,
  type PreparedMeatOutboundInput,
} from "@/lib/prepared-meat-inventory";
import { hongKongDateInputValue } from "@/lib/raw-meat-inventory";

type DraftLine = {
  key: string;
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
type OutboundCreator = (input: PreparedMeatOutboundInput) => Promise<string>;

function parseQuantity(value: string) {
  const parsed = Number.parseFloat(coercePreparedMeatQuantityInput(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function PreparedMeatOutboundModal({
  open,
  items,
  onClose,
  onSaved,
  loadCustomers = fetchMeatCustomers,
  loadShippingMethods = fetchMeatShippingMethods,
  loadOrderNumber = fetchNextPreparedMeatOrderNumber,
  createOutbound = createPreparedMeatOutbound,
}: {
  open: boolean;
  items: PreparedMeatItemOption[];
  onClose: () => void;
  onSaved: () => void;
  loadCustomers?: CustomersLoader;
  loadShippingMethods?: ShippingLoader;
  loadOrderNumber?: OrderNumberLoader;
  createOutbound?: OutboundCreator;
}) {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<MeatCustomerRow[]>([]);
  const [shippingMethods, setShippingMethods] = useState<
    MeatShippingMethodOption[]
  >([]);
  const [customerId, setCustomerId] = useState("");
  const [shippingMethodId, setShippingMethodId] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [shippingDate, setShippingDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [draftItemId, setDraftItemId] = useState("");
  const [draftQuantity, setDraftQuantity] = useState("");
  const [draftRemarks, setDraftRemarks] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
  const canConfirm = Boolean(customerId && shippingDate && orderNumber);
  const canSend = confirmed && lines.length > 0 && !submitting;

  useEffect(() => {
    if (!open) return;
    const today = hongKongDateInputValue();
    setCustomerId("");
    setShippingMethodId("");
    setShippingDate(today);
    setRemarks("");
    setConfirmed(false);
    setDraftItemId(activeItems[0]?.id ?? "");
    setDraftQuantity("");
    setDraftRemarks("");
    setLines([]);
    setError(null);
    setLoading(true);

    void Promise.all([
      loadCustomers(),
      loadShippingMethods(),
      loadOrderNumber(today),
    ])
      .then(([nextCustomers, nextMethods, nextNumber]) => {
        setCustomers(nextCustomers);
        setShippingMethods(nextMethods);
        setOrderNumber(nextNumber);
      })
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("preparedMeatInventory.outbound.loadError"),
        );
      })
      .finally(() => setLoading(false));
  }, [activeItems, loadCustomers, loadOrderNumber, loadShippingMethods, open, t]);

  useEffect(() => {
    if (!open || !shippingDate || confirmed) return;
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
  }, [confirmed, loadOrderNumber, open, shippingDate]);

  const selectCustomer = (nextId: string) => {
    setCustomerId(nextId);
    const next = customers.find((row) => row.id === nextId);
    if (!canSelectPreparedMeatShippingMethod(next?.name)) {
      setShippingMethodId("");
    }
  };

  const confirmHeader = () => {
    if (!canConfirm) return;
    setConfirmed(true);
    setError(null);
  };

  const addLine = () => {
    const item = activeItems.find((row) => row.id === draftItemId);
    const quantity = parseQuantity(draftQuantity);
    if (!item || quantity === null || quantity <= 0) {
      setError(t("preparedMeatInventory.outbound.quantityRequired"));
      return;
    }
    setLines((current) => [
      ...current,
      {
        key: `${item.id}-${current.length + 1}`,
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        quantity,
        remarks: draftRemarks.trim(),
      },
    ]);
    setDraftQuantity("");
    setDraftRemarks("");
    setError(null);
  };

  const sendToFactory = async () => {
    if (!selectedCustomer || !canSend) return;
    setSubmitting(true);
    setError(null);
    try {
      await createOutbound({
        customerId: selectedCustomer.id,
        shippingMethodId: shippingEnabled ? shippingMethodId || null : null,
        orderNumber,
        shippingDate,
        remarks,
        lines: lines.map((line) => ({
          preparedMeatItemId: line.itemId,
          quantity: line.quantity,
          remarks: line.remarks,
        })),
      });
      onSaved();
      onClose();
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("preparedMeatInventory.outbound.saveError"),
      );
    } finally {
      setSubmitting(false);
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
          <Button
            type="button"
            variant="outline"
            disabled={!confirmed}
            onClick={() => setConfirmed(false)}
          >
            {t("preparedMeatInventory.outbound.edit")}
          </Button>
          <Button type="button" disabled={!canSend} onClick={() => void sendToFactory()}>
            {submitting
              ? t("preparedMeatInventory.outbound.saving")
              : t("preparedMeatInventory.outbound.sendToFactory")}
          </Button>
        </>
      }
    >
      <div className="prepared-meat-outbound-form">
        <div className="prepared-meat-outbound-header">
          <label className="raw-meat-field">
            <span>{t("preparedMeatInventory.outbound.customer")}</span>
            <select
              aria-label={t("preparedMeatInventory.outbound.customer")}
              value={customerId}
              disabled={loading || confirmed}
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
          <label className="raw-meat-field">
            <span>{t("preparedMeatInventory.outbound.orderNumber")}</span>
            <input
              readOnly
              value={orderNumber}
              aria-label={t("preparedMeatInventory.outbound.orderNumber")}
            />
          </label>
          <label className="raw-meat-field">
            <span>{t("preparedMeatInventory.outbound.contact")}</span>
            <input
              readOnly
              value={selectedCustomer?.contactPerson ?? ""}
              aria-label={t("preparedMeatInventory.outbound.contact")}
            />
          </label>
          <label className="raw-meat-field">
            <span>{t("preparedMeatInventory.outbound.shippingDate")}</span>
            <input
              type="date"
              value={shippingDate}
              disabled={loading || confirmed}
              onChange={(event) => setShippingDate(event.target.value)}
              aria-label={t("preparedMeatInventory.outbound.shippingDate")}
            />
          </label>
          <label className="raw-meat-field">
            <span>{t("preparedMeatInventory.outbound.phone")}</span>
            <input
              readOnly
              value={selectedCustomer?.phone ?? ""}
              aria-label={t("preparedMeatInventory.outbound.phone")}
            />
          </label>
          <label className="raw-meat-field">
            <span>{t("preparedMeatInventory.outbound.shippingMethod")}</span>
            <select
              aria-label={t("preparedMeatInventory.outbound.shippingMethod")}
              value={shippingMethodId}
              disabled={!shippingEnabled || loading || confirmed}
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
              readOnly
              rows={2}
              value={selectedCustomer?.address ?? ""}
              aria-label={t("preparedMeatInventory.outbound.address")}
            />
          </label>
          <label className="raw-meat-field">
            <span>{t("preparedMeatInventory.outbound.remarks")}</span>
            <input
              value={remarks}
              disabled={confirmed}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder={t("preparedMeatInventory.outbound.remarksPlaceholder")}
              aria-label={t("preparedMeatInventory.outbound.remarks")}
            />
          </label>
        </div>

        <Button
          type="button"
          size="sm"
          disabled={!canConfirm || confirmed}
          onClick={confirmHeader}
        >
          {t("preparedMeatInventory.outbound.confirm")}
        </Button>

        {confirmed ? (
          <>
            <div className="prepared-meat-outbound-add-row">
              <label className="raw-meat-field">
                <span>{t("preparedMeatInventory.outbound.product")}</span>
                <select
                  aria-label={t("preparedMeatInventory.outbound.product")}
                  value={draftItemId}
                  onChange={(event) => setDraftItemId(event.target.value)}
                >
                  {activeItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="raw-meat-field">
                <span>{t("preparedMeatInventory.outbound.quantity")}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  pattern="[0-9]*[.]?[0-9]*"
                  value={draftQuantity}
                  onBeforeInput={(event) => {
                    if (
                      typeof event.data === "string" &&
                      event.data.length > 0 &&
                      !/[\d.０-９．]/.test(event.data)
                    ) {
                      event.preventDefault();
                    }
                  }}
                  onChange={(event) =>
                    setDraftQuantity(
                      coercePreparedMeatQuantityInput(event.target.value),
                    )
                  }
                  placeholder={t(
                    "preparedMeatInventory.outbound.quantityPlaceholder",
                  )}
                  aria-label={t("preparedMeatInventory.outbound.quantity")}
                />
              </label>
              <label className="raw-meat-field">
                <span>{t("preparedMeatInventory.outbound.lineRemarks")}</span>
                <input
                  value={draftRemarks}
                  onChange={(event) => setDraftRemarks(event.target.value)}
                  placeholder={t(
                    "preparedMeatInventory.outbound.remarksPlaceholder",
                  )}
                  aria-label={t("preparedMeatInventory.outbound.lineRemarks")}
                />
              </label>
              <Button type="button" onClick={addLine}>
                {t("preparedMeatInventory.outbound.add")}
              </Button>
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
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        {t("preparedMeatInventory.outbound.emptyLines")}
                      </td>
                    </tr>
                  ) : (
                    lines.map((line, index) => (
                      <tr key={line.key}>
                        <td>{index + 1}</td>
                        <td>{line.sku || t("common.notSet")}</td>
                        <td>{line.name}</td>
                        <td>{line.quantity}</td>
                        <td>{line.unit || t("common.notSet")}</td>
                        <td>{line.remarks || t("common.notSet")}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {error ? (
          <p className="raw-meat-form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </SidePanel>
  );
}
