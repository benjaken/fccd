import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  PreparedMeatItemSearchSelect,
  PreparedMeatQuantityInput,
} from "@/components/prepared-meat-line-controls";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import {
  coercePreparedMeatQuantityInput,
  createPreparedMeatInboundNoRaw,
  isPreparedMeatWithoutRaw,
  type PreparedMeatInboundNoRawInput,
  type PreparedMeatItemOption,
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

type InboundCreator = (
  input: PreparedMeatInboundNoRawInput,
) => Promise<string>;

function parseQuantity(value: string) {
  const parsed = Number.parseFloat(coercePreparedMeatQuantityInput(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function PreparedMeatInboundNoRawModal({
  open,
  items,
  selectedItemId,
  onClose,
  onSaved,
  createInbound = createPreparedMeatInboundNoRaw,
}: {
  open: boolean;
  items: PreparedMeatItemOption[];
  selectedItemId?: string | null;
  onClose: () => void;
  onSaved: () => void;
  createInbound?: InboundCreator;
}) {
  const { t } = useTranslation();
  const [movementDate, setMovementDate] = useState("");
  const [draftItemId, setDraftItemId] = useState("");
  const [draftQuantity, setDraftQuantity] = useState("");
  const [draftRemarks, setDraftRemarks] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeItems = useMemo(
    () => items.filter((item) => item.isActive && isPreparedMeatWithoutRaw(item)),
    [items],
  );

  const quantityError = (quantity: number | null) => {
    if (quantity === null || quantity <= 0) {
      return t("preparedMeatInventory.outbound.quantityRequired");
    }
    return null;
  };

  const canSave =
    Boolean(movementDate && lines.length > 0) &&
    lines.every((line) => !quantityError(line.quantity)) &&
    !submitting;

  useEffect(() => {
    if (!open) return;
    setMovementDate(hongKongDateInputValue());
    setDraftItemId(
      activeItems.some((item) => item.id === selectedItemId)
        ? (selectedItemId as string)
        : "",
    );
    setDraftQuantity("");
    setDraftRemarks("");
    setLines([]);
    setError(null);
    setSubmitting(false);
  }, [activeItems, open, selectedItemId]);

  const addLine = () => {
    const item = activeItems.find((row) => row.id === draftItemId);
    const quantity = parseQuantity(draftQuantity);
    if (!item) {
      setError(t("preparedMeatInventory.outbound.productRequired"));
      return;
    }
    const invalid = quantityError(quantity);
    if (invalid || quantity === null) {
      setError(invalid ?? t("preparedMeatInventory.outbound.quantityRequired"));
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

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  };

  const saveInbound = async () => {
    if (!canSave) return;
    const invalidLine = lines.map((line) => quantityError(line.quantity)).find(Boolean);
    if (invalidLine) {
      setError(invalidLine);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createInbound({
        movementDate,
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
          : t("preparedMeatInventory.inboundNoRaw.saveError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t("preparedMeatInventory.inboundNoRaw.title")}
      onClose={onClose}
      closeLabel={t("preparedMeatInventory.closeOptions")}
      extraWide
      footer={
        <Button type="button" disabled={!canSave} onClick={() => void saveInbound()}>
          {submitting
            ? t("preparedMeatInventory.inboundNoRaw.saving")
            : t("preparedMeatInventory.outbound.confirm")}
        </Button>
      }
    >
      <div className="prepared-meat-outbound-form">
        <div className="prepared-meat-inbound-header">
          <label className="raw-meat-field prepared-meat-inbound-date">
            <span>{t("preparedMeatInventory.inboundNoRaw.movementDate")}</span>
            <input
              type="date"
              value={movementDate}
              disabled={submitting}
              onChange={(event) => setMovementDate(event.target.value)}
              aria-label={t("preparedMeatInventory.inboundNoRaw.movementDate")}
            />
          </label>
        </div>

        <div className="prepared-meat-outbound-add-rows">
          <div className="prepared-meat-outbound-add-row">
            <div className="raw-meat-field">
              <PreparedMeatItemSearchSelect
                label={t("preparedMeatInventory.outbound.preparedProduct")}
                placeholder={t("preparedMeatInventory.outbound.preparedProductPlaceholder")}
                value={draftItemId}
                options={activeItems}
                disabled={submitting}
                onChange={setDraftItemId}
              />
            </div>
            <div className="raw-meat-field">
              <PreparedMeatQuantityInput
                value={draftQuantity}
                onChange={setDraftQuantity}
                disabled={submitting}
                placeholder={t("preparedMeatInventory.outbound.quantityPlaceholder")}
                ariaLabel={t("preparedMeatInventory.outbound.preparedQuantity")}
              />
            </div>
            <div className="raw-meat-field">
              <input
                value={draftRemarks}
                disabled={submitting}
                onChange={(event) => setDraftRemarks(event.target.value)}
                placeholder={t(
                  "preparedMeatInventory.outbound.lineRemarksPlaceholder",
                )}
                aria-label={t("preparedMeatInventory.outbound.preparedRemarks")}
              />
            </div>
            <Button type="button" disabled={submitting} onClick={addLine}>
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
                      <PreparedMeatQuantityInput
                        value={line.quantity > 0 ? String(line.quantity) : ""}
                        onChange={(value) => {
                          const quantity = parseQuantity(value);
                          const next = quantity && quantity > 0 ? quantity : 0;
                          if (next > 0) {
                            const invalid = quantityError(next);
                            if (invalid) {
                              setError(invalid);
                              return;
                            }
                          }
                          updateLine(line.key, { quantity: next });
                          setError(null);
                        }}
                        placeholder={t("preparedMeatInventory.outbound.quantityPlaceholder")}
                        ariaLabel={`${line.name} ${t("preparedMeatInventory.outbound.quantity")}`}
                      />
                    </td>
                    <td>{line.unit || t("common.notSet")}</td>
                    <td>
                      <input
                        value={line.remarks}
                        onChange={(event) =>
                          updateLine(line.key, { remarks: event.target.value })
                        }
                        placeholder={t(
                          "preparedMeatInventory.outbound.lineRemarksPlaceholder",
                        )}
                        aria-label={`${line.name} ${t("preparedMeatInventory.outbound.lineRemarks")}`}
                      />
                    </td>
                    <td>
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
