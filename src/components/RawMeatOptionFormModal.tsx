import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { RawMeatTagPicker } from "@/components/RawMeatTagPicker";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import {
  createRawMeatItem,
  fetchRawMeatSuppliers,
  updateRawMeatItem,
  type RawMeatItemOption,
  type RawMeatItemWriteInput,
  type RawMeatSupplierOption,
} from "@/lib/raw-meat-inventory";

type ItemCreator = typeof createRawMeatItem;
type ItemUpdater = typeof updateRawMeatItem;
type SuppliersLoader = () => Promise<RawMeatSupplierOption[]>;

export function RawMeatOptionFormModal({
  open,
  item,
  onClose,
  onSaved,
  loadSuppliers = fetchRawMeatSuppliers,
  createItem = createRawMeatItem,
  updateItem = updateRawMeatItem,
}: {
  open: boolean;
  item: RawMeatItemOption | null;
  onClose: () => void;
  onSaved: (row: RawMeatItemOption, mode: "create" | "edit") => void;
  loadSuppliers?: SuppliersLoader;
  createItem?: ItemCreator;
  updateItem?: ItemUpdater;
}) {
  const { t } = useTranslation();
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [englishName, setEnglishName] = useState("");
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<RawMeatSupplierOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const editing = Boolean(item);

  useEffect(() => {
    if (!open) return;
    setSku(item?.sku ?? "");
    setName(item?.name ?? "");
    setEnglishName(item?.englishName ?? "");
    setSupplierIds(item?.suppliers.map((supplier) => supplier.id) ?? []);
    setError(null);
    setNameError(null);
    void loadSuppliers()
      .then((rows) => {
        const extras = (item?.suppliers ?? []).filter(
          (supplier) => !rows.some((row) => row.id === supplier.id),
        );
        setSuppliers([...rows, ...extras]);
      })
      .catch((loadError: unknown) => {
        setSuppliers(item?.suppliers ?? []);
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("rawMeatInventory.optionLoadError"),
        );
      });
  }, [item, loadSuppliers, open, t]);

  const closeAndReset = () => {
    setError(null);
    setNameError(null);
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setNameError(t("rawMeatInventory.validation.nameRequired"));
      return;
    }
    setNameError(null);
    setSubmitting(true);
    setError(null);
    const payload: RawMeatItemWriteInput = {
      sku,
      name,
      englishName,
      supplierIds,
    };
    try {
      const row = item
        ? await updateItem(item.id, payload)
        : await createItem(payload);
      onSaved(row, item ? "edit" : "create");
      closeAndReset();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t(
              editing
                ? "rawMeatInventory.optionEditError"
                : "rawMeatInventory.optionCreateError",
            ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = name.trim().length > 0 && !submitting;

  return (
    <SidePanel
      open={open}
      title={t(
        editing
          ? "rawMeatInventory.editOptionTitle"
          : "rawMeatInventory.createOptionTitle",
      )}
      onClose={closeAndReset}
      closeLabel={t("rawMeatInventory.closeOptions")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={closeAndReset}>
            {t("rawMeatInventory.cancel")}
          </Button>
          <Button
            type="submit"
            form="raw-meat-option-form"
            disabled={!canSubmit}
          >
            {submitting
              ? t("rawMeatInventory.savingOption")
              : t("rawMeatInventory.submitOption")}
          </Button>
        </>
      }
    >
      <form
        id="raw-meat-option-form"
        className="raw-meat-option-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="raw-meat-field">
          <span>{t("rawMeatInventory.fields.sku")}</span>
          <input
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            placeholder={t("rawMeatInventory.fields.skuPlaceholder")}
          />
        </label>
        <label className="raw-meat-field">
          <span>{t("rawMeatInventory.fields.name")}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("rawMeatInventory.fields.namePlaceholder")}
            aria-invalid={Boolean(nameError)}
          />
          {nameError ? (
            <em className="raw-meat-field-error">{nameError}</em>
          ) : null}
        </label>
        <label className="raw-meat-field">
          <span>{t("rawMeatInventory.fields.englishName")}</span>
          <input
            value={englishName}
            onChange={(event) => setEnglishName(event.target.value)}
            placeholder={t("rawMeatInventory.fields.englishNamePlaceholder")}
          />
        </label>
        <RawMeatTagPicker
          label={t("rawMeatInventory.fields.suppliers")}
          values={supplierIds}
          options={suppliers}
          onChange={setSupplierIds}
          placeholder={t("rawMeatInventory.fields.suppliersPlaceholder")}
        />
        {error ? <p className="raw-meat-form-error">{error}</p> : null}
      </form>
    </SidePanel>
  );
}
