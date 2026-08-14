import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { PreparedMeatQuantityInput } from "@/components/prepared-meat-line-controls";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import {
  coercePreparedMeatIntegerInput,
  fetchPreparedMeatInboundEdit,
  inboundEditChecksYield,
  isPreparedInboundPackAllowed,
  preparedInboundPackRange,
  updatePreparedMeatInboundQuantity,
  type PreparedMeatInboundEdit,
} from "@/lib/prepared-meat-inventory";

type EditLoader = (movementId: string) => Promise<PreparedMeatInboundEdit>;
type QuantitySaver = (input: {
  movementId: string;
  quantity: number;
}) => Promise<string>;

function parseInteger(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function messageFromUnknownError(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message ?? "").trim();
    if (message) return message;
  }
  return fallback;
}

export function PreparedMeatInboundEditModal({
  open,
  movementId,
  onClose,
  onSaved,
  loadInbound = fetchPreparedMeatInboundEdit,
  updateInbound = updatePreparedMeatInboundQuantity,
}: {
  open: boolean;
  movementId: string | null;
  onClose: () => void;
  onSaved: () => void;
  loadInbound?: EditLoader;
  updateInbound?: QuantitySaver;
}) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<PreparedMeatInboundEdit | null>(null);
  const [quantityText, setQuantityText] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quantity = parseInteger(quantityText);
  const checkYield = preview ? inboundEditChecksYield(preview) : false;
  const yieldRange = checkYield
    ? preparedInboundPackRange(preview?.budgetedPacks ?? 0)
    : null;
  const yieldInvalid =
    checkYield &&
    quantity !== null &&
    !isPreparedInboundPackAllowed(quantity, preview?.budgetedPacks ?? 0);
  const canSave =
    Boolean(movementId && preview) &&
    quantity !== null &&
    quantity > 0 &&
    !yieldInvalid &&
    !loading &&
    !submitting;

  useEffect(() => {
    if (!open || !movementId) {
      setPreview(null);
      setQuantityText("");
      setError(null);
      setSubmitting(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSubmitting(false);
    void loadInbound(movementId)
      .then((next) => {
        if (cancelled) return;
        setPreview(next);
        setQuantityText(
          coercePreparedMeatIntegerInput(String(next.inboundPackages)),
        );
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setPreview(null);
        setQuantityText("");
        setError(
          messageFromUnknownError(
            loadError,
            t("preparedMeatInventory.inboundEdit.loadError"),
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadInbound, movementId, open, t]);

  const saveInbound = async () => {
    if (!canSave || !movementId || quantity === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateInbound({ movementId, quantity });
      onSaved();
      onClose();
    } catch (saveError: unknown) {
      const message = messageFromUnknownError(
        saveError,
        t("preparedMeatInventory.inboundEdit.saveError"),
      );
      setError(
        message.includes("within 50 percent of budgeted yield") && yieldRange
          ? t("preparedMeatInventory.inboundDeduct.yieldRange", {
              min: yieldRange.min,
              max: yieldRange.max,
              budgeted: preview?.budgetedPacks ?? 0,
            })
          : message,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t("preparedMeatInventory.inboundEdit.title")}
      onClose={onClose}
      closeLabel={t("preparedMeatInventory.closeOptions")}
      footer={
        <Button
          type="button"
          disabled={!canSave}
          onClick={() => void saveInbound()}
        >
          {submitting
            ? t("preparedMeatInventory.inboundEdit.saving")
            : t("preparedMeatInventory.submitOption")}
        </Button>
      }
    >
      <div className="raw-meat-stock-in-form prepared-meat-inbound-edit-form">
        {preview ? (
          <>
            <div className="prepared-meat-inbound-deduct-product-head">
              <strong>{preview.productName}</strong>
              {checkYield ? (
                <span className="prepared-meat-inbound-deduct-yield">
                  {t("preparedMeatInventory.inboundDeduct.budgetedYield", {
                    packs: preview.budgetedPacks,
                  })}
                </span>
              ) : null}
            </div>
            <label className="raw-meat-field">
              <span>{t("preparedMeatInventory.inboundDeduct.inboundPacks")}</span>
              <PreparedMeatQuantityInput
                value={quantityText}
                onChange={setQuantityText}
                integer
                disabled={submitting || loading}
                placeholder={t(
                  "preparedMeatInventory.inboundDeduct.packsPlaceholder",
                )}
                ariaLabel={t("preparedMeatInventory.inboundDeduct.inboundPacks")}
              />
            </label>
          </>
        ) : null}

        {yieldInvalid && yieldRange ? (
          <p className="raw-meat-form-error" role="alert">
            {t("preparedMeatInventory.inboundDeduct.yieldRange", {
              min: yieldRange.min,
              max: yieldRange.max,
              budgeted: preview?.budgetedPacks ?? 0,
            })}
          </p>
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
