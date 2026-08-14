import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { RawMeatModal } from "@/components/RawMeatModal";
import { RawMeatTagPicker } from "@/components/RawMeatTagPicker";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createRawMeatStockIn,
  DEFAULT_RAW_MEAT_UNIT_MULTIPLIERS,
  fetchRawMeatUnitMultipliers,
  hongKongDateInputValue,
  inboundTotalAmount,
  parseDecimalInput,
  quantityToKg,
  RAW_MEAT_WEIGHT_UNITS,
  roundTo,
  unitPriceToPerKg,
  type RawMeatItemOption,
  type RawMeatStockInInput,
  type RawMeatWeightUnit,
} from "@/lib/raw-meat-inventory";

type StockInCreator = typeof createRawMeatStockIn;
type UnitLoader = typeof fetchRawMeatUnitMultipliers;

function formatDollar(value: number) {
  const rounded = roundTo(value, 2);
  return Number.isInteger(rounded)
    ? `$${rounded}`
    : `$${rounded.toFixed(2)}`;
}

export function RawMeatStockInModal({
  open,
  items,
  selectedItemId,
  onClose,
  onSaved,
  createStockIn = createRawMeatStockIn,
  loadUnitMultipliers = fetchRawMeatUnitMultipliers,
}: {
  open: boolean;
  items: RawMeatItemOption[];
  selectedItemId: string | null;
  onClose: () => void;
  onSaved: (itemId: string) => void;
  createStockIn?: StockInCreator;
  loadUnitMultipliers?: UnitLoader;
}) {
  const { t } = useTranslation();
  const [itemId, setItemId] = useState<string | null>(null);
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [movementDate, setMovementDate] = useState("");
  const [unit, setUnit] = useState<RawMeatWeightUnit>("斤");
  const [unitPriceText, setUnitPriceText] = useState("");
  const [quantityText, setQuantityText] = useState("");
  const [remarks, setRemarks] = useState("");
  const [multipliers, setMultipliers] = useState(DEFAULT_RAW_MEAT_UNIT_MULTIPLIERS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemOptions = useMemo(
    () => items.filter((item) => item.isActive),
    [items],
  );
  const selectedItem =
    itemOptions.find((item) => item.id === itemId) ?? null;
  const supplierId = supplierIds[0] ?? "";

  useEffect(() => {
    if (!open) return;
    const initialItem =
      itemOptions.find((item) => item.id === selectedItemId) ??
      itemOptions[0] ??
      null;
    setItemId(initialItem?.id ?? null);
    setSupplierIds(
      initialItem?.suppliers.length === 1 ? [initialItem.suppliers[0]!.id] : [],
    );
    setMovementDate(hongKongDateInputValue());
    setUnit("斤");
    setUnitPriceText("");
    setQuantityText("");
    setRemarks("");
    setError(null);
    void loadUnitMultipliers()
      .then(setMultipliers)
      .catch(() => setMultipliers(DEFAULT_RAW_MEAT_UNIT_MULTIPLIERS));
  }, [itemOptions, loadUnitMultipliers, open, selectedItemId]);

  useEffect(() => {
    if (!open || !selectedItem) return;
    setSupplierIds((current) => {
      if (current[0] && selectedItem.suppliers.some((row) => row.id === current[0])) {
        return current;
      }
      return selectedItem.suppliers.length === 1
        ? [selectedItem.suppliers[0]!.id]
        : [];
    });
  }, [open, selectedItem]);

  const unitPrice = parseDecimalInput(unitPriceText);
  const quantity = parseDecimalInput(quantityText);
  const multiplier = multipliers[unit];
  const quantityKg =
    quantity === null ? null : quantityToKg(quantity, multiplier);
  const unitPriceKg =
    unitPrice === null ? null : unitPriceToPerKg(unitPrice, multiplier);
  const total =
    unitPrice === null || quantity === null
      ? null
      : inboundTotalAmount(unitPrice, quantity);

  const canSubmit =
    Boolean(selectedItem && supplierId && movementDate) &&
    unitPrice !== null &&
    unitPrice >= 0 &&
    quantity !== null &&
    quantity > 0 &&
    !submitting;

  const closeAndReset = () => {
    setError(null);
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedItem || !supplierId || !movementDate) return;
    if (unitPrice === null || quantity === null || quantity <= 0) return;
    setSubmitting(true);
    setError(null);
    const payload: RawMeatStockInInput = {
      itemId: selectedItem.id,
      supplierId,
      movementDate,
      unit,
      unitPrice,
      quantity,
      remarks,
    };
    try {
      await createStockIn(payload);
      onSaved(selectedItem.id);
      closeAndReset();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("rawMeatInventory.stockInError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RawMeatModal
      open={open}
      title={t("rawMeatInventory.stockInTitle")}
      onClose={closeAndReset}
      closeLabel={t("rawMeatInventory.closeOptions")}
      className="raw-meat-stock-in-modal"
      footer={
        <Button
          type="submit"
          form="raw-meat-stock-in-form"
          className="raw-meat-form-submit"
          disabled={!canSubmit}
        >
          {submitting
            ? t("rawMeatInventory.savingStockIn")
            : t("rawMeatInventory.submitOption")}
        </Button>
      }
    >
      <form
        id="raw-meat-stock-in-form"
        className="raw-meat-stock-in-form"
        onSubmit={(event) => void submit(event)}
      >
        <RawMeatTagPicker
          label={t("rawMeatInventory.fields.name")}
          values={itemId ? [itemId] : []}
          options={itemOptions.map((item) => ({ id: item.id, name: item.name }))}
          onChange={(next) => setItemId(next[0] ?? null)}
          multiple={false}
          placeholder={t("rawMeatInventory.fields.itemPlaceholder")}
        />
        <label className="raw-meat-field">
          <span>{t("rawMeatInventory.fields.date")}</span>
          <input
            type="date"
            value={movementDate}
            onChange={(event) => setMovementDate(event.target.value)}
          />
        </label>
        <RawMeatTagPicker
          label={t("rawMeatInventory.fields.supplier")}
          values={supplierIds}
          options={selectedItem?.suppliers ?? []}
          onChange={setSupplierIds}
          multiple={false}
          placeholder={t("rawMeatInventory.fields.supplierPlaceholder")}
          disabled={!selectedItem}
        />

        <div className="raw-meat-stock-in-row">
          <label className="raw-meat-field">
            <span>{t("rawMeatInventory.fields.unitPrice")}</span>
            <input
              inputMode="decimal"
              value={unitPriceText}
              onChange={(event) => setUnitPriceText(event.target.value)}
              placeholder="$0"
              aria-label={t("rawMeatInventory.fields.unitPrice")}
            />
          </label>
          <label className="raw-meat-field">
            <span>{t("rawMeatInventory.fields.unitPriceKg")}</span>
            <input
              readOnly
              disabled
              value={unitPriceKg === null ? "" : formatDollar(unitPriceKg)}
              aria-label={t("rawMeatInventory.fields.unitPriceKg")}
            />
          </label>
          <div
            className="raw-meat-unit-toggle"
            role="group"
            aria-label={t("rawMeatInventory.fields.unit")}
          >
            {RAW_MEAT_WEIGHT_UNITS.map((option) => (
              <button
                key={option}
                type="button"
                className={cn(option === unit && "is-active")}
                aria-pressed={option === unit}
                onClick={() => setUnit(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="raw-meat-stock-in-row">
          <label className="raw-meat-field">
            <span>{t("rawMeatInventory.fields.quantity")}</span>
            <input
              inputMode="decimal"
              value={quantityText}
              onChange={(event) => setQuantityText(event.target.value)}
              placeholder="0.00"
              aria-label={t("rawMeatInventory.fields.quantity")}
            />
          </label>
          <label className="raw-meat-field">
            <span>{t("rawMeatInventory.fields.quantityKg")}</span>
            <input
              readOnly
              disabled
              value={quantityKg === null ? "" : String(roundTo(quantityKg, 4))}
              aria-label={t("rawMeatInventory.fields.quantityKg")}
            />
          </label>
          <label className="raw-meat-field">
            <span>{t("rawMeatInventory.fields.total")}</span>
            <input
              readOnly
              disabled
              value={total === null ? "" : formatDollar(total)}
              aria-label={t("rawMeatInventory.fields.total")}
            />
          </label>
        </div>

        <label className="raw-meat-field">
          <span>{t("rawMeatInventory.fields.remark")}</span>
          <textarea
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            placeholder={t("rawMeatInventory.fields.remarkPlaceholder")}
            rows={3}
          />
        </label>
        {error ? <p className="raw-meat-form-error">{error}</p> : null}
      </form>
    </RawMeatModal>
  );
}
