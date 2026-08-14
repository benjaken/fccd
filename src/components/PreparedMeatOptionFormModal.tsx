import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { RawMeatTagPicker } from "@/components/RawMeatTagPicker";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import {
  coercePreparedMeatQuantityInput,
  createPreparedMeatItem,
  fetchPreparedMeatRawMeatChoices,
  type PreparedMeatItemOption,
  type PreparedMeatItemWriteInput,
  type PreparedMeatRawMeatChoice,
} from "@/lib/prepared-meat-inventory";

type ItemCreator = (
  input: PreparedMeatItemWriteInput,
) => Promise<PreparedMeatItemOption>;
type RawMeatChoicesLoader = () => Promise<PreparedMeatRawMeatChoice[]>;

function parseKgPerPackage(value: string) {
  const parsed = Number.parseFloat(coercePreparedMeatQuantityInput(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function PreparedMeatOptionFormModal({
  open,
  onClose,
  onSaved,
  loadRawMeatChoices = fetchPreparedMeatRawMeatChoices,
  createItem = createPreparedMeatItem,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (row: PreparedMeatItemOption) => void;
  loadRawMeatChoices?: RawMeatChoicesLoader;
  createItem?: ItemCreator;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [englishName, setEnglishName] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("");
  const [kgText, setKgText] = useState("");
  const [rawMeatIds, setRawMeatIds] = useState<string[]>([]);
  const [rawMeats, setRawMeats] = useState<PreparedMeatRawMeatChoice[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setEnglishName("");
    setSku("");
    setUnit("");
    setKgText("");
    setRawMeatIds([]);
    setError(null);
    setNameError(null);
    void loadRawMeatChoices()
      .then(setRawMeats)
      .catch((loadError: unknown) => {
        setRawMeats([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("preparedMeatInventory.optionLoadError"),
        );
      });
  }, [loadRawMeatChoices, open, t]);

  const closeAndReset = () => {
    setError(null);
    setNameError(null);
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setNameError(t("preparedMeatInventory.validation.nameRequired"));
      return;
    }
    setNameError(null);
    setSubmitting(true);
    setError(null);
    const payload: PreparedMeatItemWriteInput = {
      name,
      englishName,
      sku,
      unit,
      kgPerPackage: parseKgPerPackage(kgText),
      rawMeatItemIds: rawMeatIds,
    };
    try {
      const row = await createItem(payload);
      onSaved(row);
      closeAndReset();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("preparedMeatInventory.optionCreateError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = name.trim().length > 0 && !submitting;

  return (
    <SidePanel
      open={open}
      title={t("preparedMeatInventory.createOptionTitle")}
      onClose={closeAndReset}
      closeLabel={t("preparedMeatInventory.closeOptions")}
      footer={
        <Button type="submit" form="prepared-meat-option-form" disabled={!canSubmit}>
          {submitting
            ? t("preparedMeatInventory.savingOption")
            : t("preparedMeatInventory.submitOption")}
        </Button>
      }
    >
      <form
        id="prepared-meat-option-form"
        className="raw-meat-option-form"
        onSubmit={(event) => void submit(event)}
      >
        <label className="raw-meat-field">
          <span>{t("preparedMeatInventory.fields.name")}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("preparedMeatInventory.fields.namePlaceholder")}
            aria-label={t("preparedMeatInventory.fields.name")}
            aria-invalid={Boolean(nameError)}
          />
          {nameError ? (
            <em className="raw-meat-field-error">{nameError}</em>
          ) : null}
        </label>
        <label className="raw-meat-field">
          <span>{t("preparedMeatInventory.fields.englishName")}</span>
          <input
            value={englishName}
            onChange={(event) => setEnglishName(event.target.value)}
            placeholder={t(
              "preparedMeatInventory.fields.englishNamePlaceholder",
            )}
            aria-label={t("preparedMeatInventory.fields.englishName")}
          />
        </label>
        <label className="raw-meat-field">
          <span>{t("preparedMeatInventory.fields.sku")}</span>
          <input
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            placeholder={t("preparedMeatInventory.fields.skuPlaceholder")}
            aria-label={t("preparedMeatInventory.fields.sku")}
          />
        </label>
        <label className="raw-meat-field">
          <span>{t("preparedMeatInventory.fields.unit")}</span>
          <input
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            placeholder={t("preparedMeatInventory.fields.unitPlaceholder")}
            aria-label={t("preparedMeatInventory.fields.unit")}
          />
        </label>
        <label className="raw-meat-field">
          <span>{t("preparedMeatInventory.fields.kgPerPackage")}</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            pattern="[0-9]*[.]?[0-9]*"
            value={kgText}
            placeholder={t("preparedMeatInventory.fields.kgPerPackagePlaceholder")}
            aria-label={t("preparedMeatInventory.fields.kgPerPackage")}
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
              setKgText(coercePreparedMeatQuantityInput(event.target.value))
            }
          />
        </label>
        <RawMeatTagPicker
          label={t("preparedMeatInventory.fields.rawMeat")}
          values={rawMeatIds}
          options={rawMeats}
          onChange={setRawMeatIds}
          placeholder={t("preparedMeatInventory.fields.rawMeatPlaceholder")}
        />
        {error ? (
          <p className="raw-meat-form-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </SidePanel>
  );
}
