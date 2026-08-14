import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

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
  meatCustomerOptionLabel,
  sendPreparedMeatOrderToFactory,
  type DirectShipRawMeatOption,
  type MeatShippingMethodOption,
  type PreparedMeatItemOption,
  type PreparedMeatOutboundInput,
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

type SearchOption = { id: string; name: string; sku?: string | null };

type CustomersLoader = () => Promise<MeatCustomerRow[]>;
type ShippingLoader = () => Promise<MeatShippingMethodOption[]>;
type OrderNumberLoader = (shippingDate: string) => Promise<string>;
type RawItemsLoader = () => Promise<DirectShipRawMeatOption[]>;
type OutboundCreator = (input: PreparedMeatOutboundInput) => Promise<string>;
type FactorySender = (orderId: string) => Promise<string>;

function parseQuantity(value: string) {
  const parsed = Number.parseFloat(coercePreparedMeatQuantityInput(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function QuantityInput({
  value,
  onChange,
  disabled,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
  ariaLabel: string;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      pattern="[0-9]*[.]?[0-9]*"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
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
        onChange(coercePreparedMeatQuantityInput(event.target.value))
      }
    />
  );
}

function OutboundItemSearchSelect({
  label,
  placeholder,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  options: SearchOption[];
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value) ?? null;
  const needle = query.trim().toLocaleLowerCase("zh-HK");
  const available = options.filter((option) => {
    if (!needle) return true;
    return (
      option.name.toLocaleLowerCase("zh-HK").includes(needle) ||
      (option.sku ?? "").toLocaleLowerCase("zh-HK").includes(needle)
    );
  });

  return (
    <div className="prepared-meat-outbound-item-picker">
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={open ? query : (selected?.name ?? "")}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (value) onChange("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            const first = available[0];
            if (first) {
              onChange(first.id);
              setQuery("");
              setOpen(false);
            }
          }
          if (event.key === "Escape") setOpen(false);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
      />
      {open && !disabled ? (
        <ul className="raw-meat-tag-menu" role="listbox" aria-label={label}>
          {available.length === 0 ? (
            <li className="raw-meat-tag-empty">{placeholder}</li>
          ) : (
            available.map((option) => (
              <li key={option.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={option.id === value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(option.id);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  {option.name}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

export function PreparedMeatOutboundModal({
  open,
  items,
  onClose,
  onSaved,
  loadCustomers = fetchMeatCustomers,
  loadShippingMethods = fetchMeatShippingMethods,
  loadOrderNumber = fetchNextPreparedMeatOrderNumber,
  loadRawItems = fetchDirectShipRawMeatItems,
  createOutbound = createPreparedMeatOutbound,
  sendToFactory = sendPreparedMeatOrderToFactory,
}: {
  open: boolean;
  items: PreparedMeatItemOption[];
  onClose: () => void;
  onSaved: () => void;
  loadCustomers?: CustomersLoader;
  loadShippingMethods?: ShippingLoader;
  loadOrderNumber?: OrderNumberLoader;
  loadRawItems?: RawItemsLoader;
  createOutbound?: OutboundCreator;
  sendToFactory?: FactorySender;
}) {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<MeatCustomerRow[]>([]);
  const [shippingMethods, setShippingMethods] = useState<
    MeatShippingMethodOption[]
  >([]);
  const [rawItems, setRawItems] = useState<DirectShipRawMeatOption[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [shippingMethodId, setShippingMethodId] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [shippingDate, setShippingDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [savedOrderId, setSavedOrderId] = useState<string | null>(null);
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
  const saved = Boolean(savedOrderId);
  const canSave =
    Boolean(customerId && shippingDate && orderNumber && lines.length > 0) &&
    !saved &&
    !submitting &&
    !loading;

  useEffect(() => {
    if (!open) return;
    const today = hongKongDateInputValue();
    setCustomerId("");
    setShippingMethodId("");
    setShippingDate(today);
    setRemarks("");
    setSavedOrderId(null);
    setDraftPreparedId("");
    setDraftPreparedQuantity("");
    setDraftPreparedRemarks("");
    setDraftRawId("");
    setDraftRawQuantity("");
    setDraftRawRemarks("");
    setLines([]);
    setError(null);
    setLoading(true);

    void Promise.all([
      loadCustomers(),
      loadShippingMethods(),
      loadOrderNumber(today),
      loadRawItems(),
    ])
      .then(([nextCustomers, nextMethods, nextNumber, nextRawItems]) => {
        setCustomers(nextCustomers);
        setShippingMethods(nextMethods);
        setOrderNumber(nextNumber);
        setRawItems(nextRawItems);
      })
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("preparedMeatInventory.outbound.loadError"),
        );
      })
      .finally(() => setLoading(false));
  }, [
    loadCustomers,
    loadOrderNumber,
    loadRawItems,
    loadShippingMethods,
    open,
    t,
  ]);

  useEffect(() => {
    if (!open || !shippingDate || saved) return;
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
  }, [loadOrderNumber, open, saved, shippingDate]);

  const selectCustomer = (nextId: string) => {
    setCustomerId(nextId);
    const next = customers.find((row) => row.id === nextId);
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
    item:
      | PreparedMeatItemOption
      | DirectShipRawMeatOption
      | undefined,
    quantityText: string,
    lineRemarks: string,
    clear: () => void,
  ) => {
    const quantity = parseQuantity(quantityText);
    if (!item) {
      setError(t("preparedMeatInventory.outbound.productRequired"));
      return;
    }
    if (quantity === null || quantity <= 0) {
      setError(t("preparedMeatInventory.outbound.quantityRequired"));
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

  const saveOutbound = async () => {
    if (!selectedCustomer || !canSave) return;
    setSubmitting(true);
    setError(null);
    try {
      const orderId = await createOutbound({
        customerId: selectedCustomer.id,
        shippingMethodId: shippingEnabled ? shippingMethodId || null : null,
        orderNumber,
        shippingDate,
        remarks,
        lines: lines.map((line) => ({
          preparedMeatItemId:
            line.kind === "prepared" ? line.itemId : null,
          rawMeatItemId: line.kind === "raw" ? line.itemId : null,
          quantity: line.quantity,
          remarks: line.remarks,
        })),
      });
      setSavedOrderId(orderId);
      onSaved();
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
        saved ? (
          <Button
            type="button"
            disabled={sending}
            onClick={() => void markSentToFactory()}
          >
            {sending
              ? t("preparedMeatInventory.outbound.saving")
              : t("preparedMeatInventory.outbound.sendToFactory")}
          </Button>
        ) : (
          <Button
            type="button"
            disabled={!canSave}
            onClick={() => void saveOutbound()}
          >
            {submitting
              ? t("preparedMeatInventory.outbound.saving")
              : t("preparedMeatInventory.outbound.confirm")}
          </Button>
        )
      }
    >
      <div className="prepared-meat-outbound-form">
        <div className="prepared-meat-outbound-header">
          <label className="raw-meat-field">
            <span>{t("preparedMeatInventory.outbound.customer")}</span>
            <select
              aria-label={t("preparedMeatInventory.outbound.customer")}
              value={customerId}
              disabled={loading || saved}
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
              disabled={loading || saved}
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
              disabled={!shippingEnabled || loading || saved}
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
              disabled={saved}
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
                <OutboundItemSearchSelect
                  label={t("preparedMeatInventory.outbound.rawProduct")}
                  placeholder={t("preparedMeatInventory.outbound.rawProduct")}
                  value={draftRawId}
                  options={rawItems}
                  disabled={saved || loading}
                  onChange={setDraftRawId}
                />
              </div>
              <div className="raw-meat-field">
                <QuantityInput
                  value={draftRawQuantity}
                  onChange={setDraftRawQuantity}
                  disabled={saved}
                  placeholder={t("preparedMeatInventory.outbound.quantity")}
                  ariaLabel={t("preparedMeatInventory.outbound.rawQuantity")}
                />
              </div>
              <div className="raw-meat-field">
                <input
                  value={draftRawRemarks}
                  disabled={saved}
                  onChange={(event) => setDraftRawRemarks(event.target.value)}
                  placeholder={t(
                    "preparedMeatInventory.outbound.lineRemarksPlaceholder",
                  )}
                  aria-label={t("preparedMeatInventory.outbound.rawRemarks")}
                />
              </div>
              <Button
                type="button"
                disabled={saved}
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
              <OutboundItemSearchSelect
                label={t("preparedMeatInventory.outbound.preparedProduct")}
                placeholder={t("preparedMeatInventory.outbound.preparedProduct")}
                value={draftPreparedId}
                options={activeItems}
                disabled={saved || loading}
                onChange={setDraftPreparedId}
              />
            </div>
            <div className="raw-meat-field">
              <QuantityInput
                value={draftPreparedQuantity}
                onChange={setDraftPreparedQuantity}
                disabled={saved}
                placeholder={t("preparedMeatInventory.outbound.quantity")}
                ariaLabel={t("preparedMeatInventory.outbound.preparedQuantity")}
              />
            </div>
            <div className="raw-meat-field">
              <input
                value={draftPreparedRemarks}
                disabled={saved}
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
              disabled={saved}
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

        {error ? (
          <p className="raw-meat-form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </SidePanel>
  );
}
