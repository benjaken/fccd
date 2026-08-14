import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { PreparedMeatQuantityInput } from "@/components/prepared-meat-line-controls";
import { RawMeatTagPicker } from "@/components/RawMeatTagPicker";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import {
  budgetedPreparedYieldPacks,
  coercePreparedMeatQuantityInput,
  createPreparedMeatInboundWithRaw,
  fetchPreparedMeatInboundRawPreview,
  fetchPreparedMeatRawMeatChoices,
  formatPreparedMeatKg,
  isPreparedInboundPackAllowed,
  preparedInboundPackRange,
  type PreparedMeatInboundRawPreview,
  type PreparedMeatInboundWithRawInput,
  type PreparedMeatRawMeatChoice,
} from "@/lib/prepared-meat-inventory";
import { hongKongDateInputValue } from "@/lib/raw-meat-inventory";

type PreviewLoader = (
  rawMeatItemId: string,
) => Promise<PreparedMeatInboundRawPreview>;
type RawChoicesLoader = () => Promise<PreparedMeatRawMeatChoice[]>;
type InboundCreator = (
  input: PreparedMeatInboundWithRawInput,
) => Promise<string>;

function parseQuantity(value: string) {
  const parsed = Number.parseFloat(coercePreparedMeatQuantityInput(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export function PreparedMeatInboundDeductModal({
  open,
  onClose,
  onSaved,
  loadRawChoices = fetchPreparedMeatRawMeatChoices,
  loadPreview = fetchPreparedMeatInboundRawPreview,
  createInbound = createPreparedMeatInboundWithRaw,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  loadRawChoices?: RawChoicesLoader;
  loadPreview?: PreviewLoader;
  createInbound?: InboundCreator;
}) {
  const { t } = useTranslation();
  const [rawChoices, setRawChoices] = useState<PreparedMeatRawMeatChoice[]>([]);
  const [rawMeatIds, setRawMeatIds] = useState<string[]>([]);
  const [movementDate, setMovementDate] = useState("");
  const [outboundText, setOutboundText] = useState("");
  const [remarks, setRemarks] = useState("");
  const [preview, setPreview] = useState<PreparedMeatInboundRawPreview | null>(
    null,
  );
  const [packTexts, setPackTexts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rawMeatId = rawMeatIds[0] ?? "";
  const remainingKg = preview?.remainingKg ?? 0;
  const hasStock = remainingKg > 0;
  const outboundKg = parseQuantity(outboundText);
  const showPrepared = hasStock && outboundKg !== null && outboundKg > 0;

  const preparedLines = useMemo(() => {
    if (!showPrepared || !preview) return [];
    return preview.items.map((item) => {
      const budgeted = budgetedPreparedYieldPacks(outboundKg, item.kgPerPackage);
      const range = preparedInboundPackRange(budgeted);
      const quantity = parseInteger(packTexts[item.id] ?? "");
      return { item, budgeted, range, quantity };
    });
  }, [outboundKg, packTexts, preview, showPrepared]);

  const filledLines = preparedLines.filter(
    (line) => line.quantity !== null && line.quantity > 0,
  );
  const invalidLine = filledLines.find(
    (line) => !isPreparedInboundPackAllowed(line.quantity ?? 0, line.budgeted),
  );
  const outboundTooHigh =
    outboundKg !== null && outboundKg > 0 && outboundKg > remainingKg;
  const canSave =
    Boolean(rawMeatId && movementDate && hasStock) &&
    outboundKg !== null &&
    outboundKg > 0 &&
    !outboundTooHigh &&
    filledLines.length > 0 &&
    !invalidLine &&
    !loading &&
    !submitting;

  useEffect(() => {
    if (!open) return;
    setRawMeatIds([]);
    setMovementDate(hongKongDateInputValue());
    setOutboundText("");
    setRemarks("");
    setPreview(null);
    setPackTexts({});
    setError(null);
    setSubmitting(false);
    setLoading(true);
    void loadRawChoices()
      .then((rows) => {
        setRawChoices(rows);
        setError(null);
      })
      .catch((loadError: unknown) => {
        setRawChoices([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("preparedMeatInventory.inboundDeduct.loadError"),
        );
      })
      .finally(() => setLoading(false));
  }, [loadRawChoices, open, t]);

  useEffect(() => {
    if (!open || !rawMeatId) {
      setPreview(null);
      setOutboundText("");
      setPackTexts({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    setOutboundText("");
    setPackTexts({});
    setPreview(null);
    setError(null);
    void loadPreview(rawMeatId)
      .then((next) => {
        if (cancelled) return;
        setPreview(next);
        setError(
          next.remainingKg > 0
            ? null
            : t("preparedMeatInventory.inboundDeduct.noStock"),
        );
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setPreview(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("preparedMeatInventory.inboundDeduct.loadError"),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadPreview, open, rawMeatId, t]);

  const saveInbound = async () => {
    if (!canSave || !rawMeatId || outboundKg === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await createInbound({
        rawMeatItemId: rawMeatId,
        movementDate,
        outboundKg,
        remarks,
        lines: filledLines.map((line) => ({
          preparedMeatItemId: line.item.id,
          quantity: line.quantity as number,
        })),
      });
      onSaved();
      onClose();
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("preparedMeatInventory.inboundDeduct.saveError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t("preparedMeatInventory.inboundDeduct.title")}
      onClose={onClose}
      closeLabel={t("preparedMeatInventory.closeOptions")}
      wide
      footer={
        <Button type="button" disabled={!canSave} onClick={() => void saveInbound()}>
          {submitting
            ? t("preparedMeatInventory.inboundDeduct.saving")
            : t("preparedMeatInventory.submitOption")}
        </Button>
      }
    >
      <div className="raw-meat-stock-in-form prepared-meat-inbound-deduct-form">
        <RawMeatTagPicker
          label={t("preparedMeatInventory.fields.rawMeat")}
          values={rawMeatIds}
          options={rawChoices}
          onChange={(next) => setRawMeatIds(next.slice(-1))}
          multiple={false}
          placeholder={t("preparedMeatInventory.fields.rawMeatPlaceholder")}
          disabled={loading || submitting}
        />

        <label className="raw-meat-field">
          <span>{t("preparedMeatInventory.inboundDeduct.date")}</span>
          <input
            type="date"
            value={movementDate}
            disabled={submitting}
            onChange={(event) => setMovementDate(event.target.value)}
            aria-label={t("preparedMeatInventory.inboundDeduct.date")}
          />
        </label>

        {rawMeatId && preview && hasStock ? (
          <>
            <div className="prepared-meat-inbound-deduct-remaining">
              <span>{t("preparedMeatInventory.inboundDeduct.remaining")}</span>
              <strong>
                {t("preparedMeatInventory.inboundDeduct.remainingTotal", {
                  kg: formatPreparedMeatKg(remainingKg),
                })}
              </strong>
            </div>
            <label className="raw-meat-field">
              <span>{t("preparedMeatInventory.inboundDeduct.outboundKg")}</span>
              <PreparedMeatQuantityInput
                value={outboundText}
                onChange={(value) => {
                  setOutboundText(value);
                  setPackTexts({});
                }}
                disabled={submitting}
                placeholder={t("preparedMeatInventory.outbound.quantityPlaceholder")}
                ariaLabel={t("preparedMeatInventory.inboundDeduct.outboundKg")}
              />
            </label>
          </>
        ) : null}

        {showPrepared ? (
          <div className="prepared-meat-inbound-deduct-products">
            {preparedLines.length === 0 ? (
              <p className="raw-meat-form-error" role="status">
                {t("preparedMeatInventory.inboundDeduct.noProducts")}
              </p>
            ) : (
              preparedLines.map((line) => {
                const unit = line.item.unit || t("preparedMeatInventory.inboundDeduct.packUnit");
                const quantity = line.quantity ?? 0;
                return (
                  <div
                    key={line.item.id}
                    className="prepared-meat-inbound-deduct-product"
                  >
                    <div>
                      <strong>
                        {t("preparedMeatInventory.inboundDeduct.productInbound", {
                          name: line.item.name,
                          unit,
                        })}
                      </strong>
                      <span>
                        {t("preparedMeatInventory.inboundDeduct.budgetedYield", {
                          packs: line.budgeted,
                        })}
                      </span>
                    </div>
                    <div>
                      <PreparedMeatQuantityInput
                        value={packTexts[line.item.id] ?? ""}
                        onChange={(value) =>
                          setPackTexts((current) => ({
                            ...current,
                            [line.item.id]: value,
                          }))
                        }
                        integer
                        disabled={submitting}
                        placeholder="0"
                        ariaLabel={`${line.item.name} ${t("preparedMeatInventory.inboundDeduct.inboundPacks")}`}
                      />
                      <strong>
                        {t("preparedMeatInventory.inboundDeduct.packTotal", {
                          quantity,
                          unit,
                        })}
                      </strong>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : null}

        <label className="raw-meat-field">
          <span>{t("preparedMeatInventory.outbound.remarks")}</span>
          <input
            value={remarks}
            disabled={submitting}
            onChange={(event) => setRemarks(event.target.value)}
            placeholder={t("preparedMeatInventory.outbound.remarksPlaceholder")}
            aria-label={t("preparedMeatInventory.outbound.remarks")}
          />
        </label>

        {outboundTooHigh ? (
          <p className="raw-meat-form-error" role="alert">
            {t("preparedMeatInventory.inboundDeduct.exceedsRemaining", {
              kg: formatPreparedMeatKg(remainingKg),
            })}
          </p>
        ) : null}
        {invalidLine ? (
          <p className="raw-meat-form-error" role="alert">
            {t("preparedMeatInventory.inboundDeduct.yieldRange", {
              min: invalidLine.range.min,
              max: invalidLine.range.max,
              budgeted: invalidLine.budgeted,
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
