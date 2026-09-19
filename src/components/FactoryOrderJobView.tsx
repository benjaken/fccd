import { Fragment, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Printer, ShoppingCart, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  assignDeliveryMotorcade,
  type DeliveryListItem,
} from "@/lib/deliveries";
import {
  hongKongDateKey,
  markFactoryOrderLinePrinted,
  updateFactoryDispatchTime,
  type FactoryFleet,
  type FactoryOrderLine,
  type FactoryOrderLineChange,
  type FactoryOrderJob,
} from "@/lib/factory-board";
import {
  combineFactoryLabelBase64,
  fetchFactoryLabelCommand,
  type FactoryLabelCommandLoader,
} from "@/lib/factory-label";
import {
  factoryMenuCategoryRank,
  groupFactoryMenuRowsByCategory,
  type FactoryMenuCategory,
} from "@/lib/factory-menu-category";
import { useQzTray } from "@/lib/qz-tray";
import { formatDeliveryAddress } from "@/lib/delivery-address";
import { printPdf } from "@/lib/print-pdf";
import {
  formatFactoryOrderNumber,
  normalizeFactoryOrderNumber,
} from "@/lib/factory-order-number";
import "@/components/factory-change-task.css";
import {
  DeliveryNoteDocument,
  formatDeliveryNoteWeekday,
} from "@/components/DeliveryNoteDocument";

export { formatFactoryDeliveryNoteQuantity } from "@/components/DeliveryNoteDocument";

export function preferredFactoryLabelPrinter(printers: string[]): string {
  return printers.find((printer) => /xprinter/i.test(printer)) ?? printers[0] ?? "";
}

export function factoryLabelCopies(quantityText: string | null): number {
  const match = quantityText?.match(/\d+(?:\.\d+)?/);
  const quantity = match ? Number(match[0]) : 1;
  return Number.isFinite(quantity) ? Math.max(1, Math.ceil(quantity)) : 1;
}

export function factoryLabelPrintCompletesSet(
  quantityText: string | null,
  fullSet: boolean,
): boolean {
  return fullSet || factoryLabelCopies(quantityText) === 1;
}

export function factoryOrderLineLabelNames(line: FactoryOrderLine): string[] {
  const configuredNames = (line.labelNames ?? [])
    .map((name) => name.trim())
    .filter(Boolean);
  if (configuredNames.length) return configuredNames;
  return [line.labelName?.trim() || line.label.trim()].filter(Boolean);
}

export function factoryOrderLabelCount(lines: FactoryOrderLine[]): number {
  return lines
    .filter((line) => !line.isCancelled)
    .reduce(
      (total, line) => total
        + factoryOrderLineLabelNames(line).length * factoryLabelCopies(line.quantityText),
      0,
    );
}

const factoryChangeFieldKeys: Record<string, string> = {
  product_id: "factoryBoard.changedProduct",
  package_id: "factoryBoard.changedPackage",
  product_name_snapshot: "factoryBoard.changedOriginalName",
  content_snapshot: "factoryBoard.changedLabelContent",
  quantity: "factoryBoard.changedQuantity",
  new_quantity_text: "factoryBoard.changedQuantityText",
  remarks_1: "factoryBoard.changedRemarkOne",
  remarks_2: "factoryBoard.changedRemarkTwo",
  label_remarks: "factoryBoard.changedRemarkOne",
  is_addon: "factoryBoard.changedComplimentary",
  is_void: "factoryBoard.changedVoided",
};

function factoryChangeValue(value: unknown, language: string, empty: string): string {
  if (value === null || value === undefined || value === "") return empty;
  if (typeof value === "boolean") {
    return language.startsWith("zh") ? (value ? "是" : "否") : value ? "Yes" : "No";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

function visibleFactoryChangeFields(change: FactoryOrderLineChange) {
  return Object.entries(change.changedFields).filter(([field]) =>
    Boolean(factoryChangeFieldKeys[field]),
  );
}

export function FactoryOrderJobView({
  item,
  job,
  loading,
  error,
  selectedBadge,
  fleets,
  assignMotorcade = assignDeliveryMotorcade,
  markLinePrinted = markFactoryOrderLinePrinted,
  loadLabelCommand = fetchFactoryLabelCommand,
  saveDispatchTime = updateFactoryDispatchTime,
  onLinePrinted,
  onAssigned,
  onBack,
  qz,
}: {
  item: DeliveryListItem;
  job: FactoryOrderJob | null;
  loading: boolean;
  error: boolean;
  selectedBadge?: string;
  fleets: FactoryFleet[];
  assignMotorcade?: typeof assignDeliveryMotorcade;
  markLinePrinted?: typeof markFactoryOrderLinePrinted;
  loadLabelCommand?: FactoryLabelCommandLoader;
  saveDispatchTime?: typeof updateFactoryDispatchTime;
  onLinePrinted?: (lineId: string) => void;
  onAssigned?: (fleet: FactoryFleet | null) => void;
  onBack?: () => void;
  qz: ReturnType<typeof useQzTray>;
}) {
  const { t, i18n } = useTranslation();
  const categoryLabel = (category: FactoryMenuCategory) =>
    t(`factoryBoard.menuCategories.${category}`);
  const [assignedFleetId, setAssignedFleetId] = useState(item.motorcadeId ?? "");
  const [selectedFleetId, setSelectedFleetId] = useState(item.motorcadeId ?? "");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [printing, setPrinting] = useState(false);
  const [bulkPrinting, setBulkPrinting] = useState<"all" | "address" | null>(null);
  const [bulkPrintError, setBulkPrintError] = useState(false);
  const [bulkPrintSuccess, setBulkPrintSuccess] = useState<string | null>(null);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchDraft, setDispatchDraft] = useState("");
  const [savedDispatchTime, setSavedDispatchTime] = useState(job?.dispatchTime || item.deliveryTime || "");
  const [savingDispatch, setSavingDispatch] = useState(false);
  const [dispatchError, setDispatchError] = useState(false);
  const [printError, setPrintError] = useState(false);
  const [printSuccess, setPrintSuccess] = useState<string | null>(null);
  const empty = t("common.notSet");
  const canPrint = qz.state === "connected";
  const dateKey = item.deliveryAt ? hongKongDateKey(item.deliveryAt) : "";
  const weekday = formatDeliveryNoteWeekday(dateKey, i18n.language, empty);
  const orderNumber = normalizeFactoryOrderNumber(item.orderNumber) || empty;
  const displayOrderNumber = formatFactoryOrderNumber(item.orderNumber, empty);
  const dispatchTime = savedDispatchTime || empty;
  const arrivalWindow = job?.arrivalWindow || empty;
  const assignedFleet = fleets.find((fleet) => fleet.id === assignedFleetId);
  const selectedLine = job?.lines.find((line) => line.id === selectedLineId) ?? null;
  const selectedLabelNames = selectedLine ? factoryOrderLineLabelNames(selectedLine) : [];
  const selectedName =
    assignedFleet?.shortName ||
    assignedFleet?.name ||
    selectedBadge ||
    item.motorcadeName ||
    t("factoryBoard.unassignedFleet");
  const displayLines = job?.lines.filter(
    (line) => line.isCancelled || line.label.trim().length > 0,
  ) ?? [];
  const lineCategoryGroups = groupFactoryMenuRowsByCategory(
    [...displayLines].sort(
      (left, right) =>
        factoryMenuCategoryRank(left.category) -
        factoryMenuCategoryRank(right.category),
    ),
  );
  const printableLines = displayLines.filter((line) => !line.isCancelled);
  const totalLabelCount = factoryOrderLabelCount(printableLines);
  const printBlocked = Boolean(job?.isBeingEdited);

  useEffect(() => {
    setAssignedFleetId(item.motorcadeId ?? "");
    setSelectedFleetId(item.motorcadeId ?? "");
  }, [item.motorcadeId]);

  useEffect(() => {
    setSavedDispatchTime(job?.dispatchTime || item.deliveryTime || "");
  }, [item.deliveryTime, job?.dispatchTime]);

  useEffect(() => {
    if (!qz.printers.length) {
      setSelectedPrinter("");
      return;
    }
    setSelectedPrinter((current) =>
      qz.printers.includes(current)
        ? current
        : preferredFactoryLabelPrinter(qz.printers),
    );
  }, [qz.printers]);

  useEffect(() => {
    if (!bulkPrintSuccess) return;
    const timeoutId = window.setTimeout(() => {
      setBulkPrintSuccess(null);
    }, 2_000);
    return () => window.clearTimeout(timeoutId);
  }, [bulkPrintSuccess]);

  const labelCopies = (line: FactoryOrderLine) => {
    return factoryLabelCopies(line.quantityText);
  };

  const printLine = async (line: FactoryOrderLine, fullSet: boolean) => {
    if (printBlocked || line.isCancelled || qz.state !== "connected" || !selectedPrinter) return;
    setPrinting(true);
    setPrintError(false);
    setPrintSuccess(null);
    try {
      const fullSetCopies = labelCopies(line);
      const copies = fullSet ? fullSetCopies : 1;
      const labelNames = factoryOrderLineLabelNames(line);
      const completesSet = factoryLabelPrintCompletesSet(
        line.quantityText,
        fullSet,
      );
      const labelCommands: string[] = [];
      for (const [labelIndex, labelName] of labelNames.entries()) {
        labelCommands.push(await loadLabelCommand({
          orderNumber,
          deliveryDate: dateKey,
          labelName,
          remarks: [line.remarks[labelIndex] ?? "", job?.packingNote ?? ""].filter(Boolean),
          copies,
        }));
      }
      await qz.printLabels(
        selectedPrinter,
        combineFactoryLabelBase64(labelCommands),
        1,
      );
      if (completesSet) {
        try {
          await markLinePrinted(line.id);
          onLinePrinted?.(line.id);
        } catch {
          // Printing already succeeded. A status-write failure must not be
          // reported as a printer failure or encourage a duplicate print.
        }
      }
      setPrintSuccess(
        completesSet
          ? t("factoryBoard.fullLabelPrintSuccess")
          : t("factoryBoard.singleLabelPrintSuccess"),
      );
    } catch {
      setPrintError(true);
    } finally {
      setPrinting(false);
    }
  };

  const printAllLabels = async () => {
    if (printBlocked || qz.state !== "connected" || !selectedPrinter || !printableLines.length) return;
    setBulkPrinting("all");
    setBulkPrintError(false);
    setBulkPrintSuccess(null);
    try {
      const labelCommands: string[] = [];
      for (const line of printableLines) {
        for (const [labelIndex, labelName] of factoryOrderLineLabelNames(line).entries()) {
          labelCommands.push(await loadLabelCommand({
            orderNumber,
            deliveryDate: dateKey,
            labelName,
            remarks: [line.remarks[labelIndex] ?? "", job?.packingNote ?? ""].filter(Boolean),
            copies: labelCopies(line),
          }));
        }
      }
      await qz.printLabels(
        selectedPrinter,
        combineFactoryLabelBase64(labelCommands),
        1,
      );
      for (const line of printableLines) {
        try {
          await markLinePrinted(line.id);
          onLinePrinted?.(line.id);
        } catch {
          // Continue after a successful print even if its status cannot be saved.
        }
      }
      setBulkPrintSuccess(t("factoryBoard.printAllSuccess"));
    } catch {
      setBulkPrintError(true);
    } finally {
      setBulkPrinting(null);
    }
  };

  const printAddressLabel = async () => {
    if (printBlocked || qz.state !== "connected" || !selectedPrinter) return;
    setBulkPrinting("address");
    setBulkPrintError(false);
    setBulkPrintSuccess(null);
    try {
      const commandBase64 = await loadLabelCommand({
        kind: "address",
        orderNumber,
        deliveryDate: dateKey,
        district: item.districtName || empty,
        customerName: item.customerName || empty,
        customerPhone: item.customerPhone || empty,
      });
      await qz.printLabels(selectedPrinter, commandBase64, 1);
      setBulkPrintSuccess(t("factoryBoard.printAddressSuccess"));
    } catch {
      setBulkPrintError(true);
    } finally {
      setBulkPrinting(null);
    }
  };

  const submitDispatchTime = async () => {
    if (!item.orderId || !dispatchDraft) return;
    setSavingDispatch(true);
    setDispatchError(false);
    try {
      await saveDispatchTime(item.orderId, dispatchDraft);
      setSavedDispatchTime(dispatchDraft);
      setDispatchOpen(false);
    } catch {
      setDispatchError(true);
    } finally {
      setSavingDispatch(false);
    }
  };

  const submitAssignment = async (fleetId: string) => {
    const fleet = fleetId
      ? fleets.find((entry) => entry.id === fleetId) ?? null
      : null;
    if (fleetId && !fleet) return;
    setAssigning(true);
    setAssignError(false);
    setAssignSuccess(false);
    try {
      await assignMotorcade(item.id, fleet?.id ?? null);
      setAssignedFleetId(fleet?.id ?? "");
      setAssignOpen(false);
      setAssignSuccess(true);
      onAssigned?.(fleet);
    } catch {
      setAssignError(true);
    } finally {
      setAssigning(false);
    }
  };

  return (
    <section className="factory-order-job">
      <div className="factory-job-notifications" aria-live="polite">
        {bulkPrintSuccess ? (
          <p className="factory-job-notification is-success" role="status">
            <CheckCircle2 aria-hidden="true" />
            <span>{bulkPrintSuccess}</span>
          </p>
        ) : null}
        {bulkPrintError ? (
          <p className="factory-job-notification is-error" role="alert">
            <TriangleAlert aria-hidden="true" />
            <span>{t("factoryBoard.labelPrintError")}</span>
          </p>
        ) : null}
        {assignSuccess ? (
          <p className="factory-job-notification is-success" role="status">
            <CheckCircle2 aria-hidden="true" />
            <span>{t("factoryBoard.assignmentSuccess")}</span>
          </p>
        ) : null}
      </div>
      <div className="factory-order-main">
        <div className="factory-order-summary">
          <h1 className="factory-order-number">{displayOrderNumber}</h1>
          <dl className="factory-order-meta">
            <div className="is-date">
              {dateKey
                ? t("factoryBoard.orderDate", {
                    month: dateKey.slice(5, 7),
                    day: dateKey.slice(8, 10),
                    weekday,
                  })
                : empty}
            </div>
            <div className="is-dispatch">
              <button
                type="button"
                className="factory-dispatch-time-trigger"
                aria-label={t("factoryBoard.editDispatchTime")}
                onClick={() => {
                  setDispatchDraft(savedDispatchTime);
                  setDispatchError(false);
                  setDispatchOpen(true);
                }}
              >
                {t("factoryBoard.dispatchTime")}: {dispatchTime}
              </button>
            </div>
            <div className="is-arrival">
              {t("factoryBoard.arrivalWindow")}: {arrivalWindow}
            </div>
            <div className="is-phone">
              {t("factoryBoard.phone")}: {item.customerPhone || empty}
            </div>
            <div className="is-address">
              {t("factoryBoard.address")}: {formatDeliveryAddress(
                item.address,
                item.shippingMethodName,
                empty,
              )}
            </div>
            <div className="is-customer">
              {t("factoryBoard.guestName")}: {item.customerName || empty}
            </div>
          </dl>
        </div>

        <p className="factory-order-packing">
          <ShoppingCart aria-hidden="true" />
          <span>
            {t("factoryBoard.packingNote")}: {job?.packingNote || empty}
          </span>
        </p>

        <div className="factory-order-lines" aria-busy={loading || undefined}>
          {loading ? (
            <p className="factory-day-state">{t("common.loading")}</p>
          ) : error ? (
            <p className="factory-day-state">{t("factoryBoard.orderLoadError")}</p>
          ) : !displayLines.length ? (
            <p className="factory-day-state">{t("factoryBoard.emptyLines")}</p>
          ) : (
            lineCategoryGroups.map((group) => (
              <Fragment key={group.category}>
                <p className="factory-order-line-category">
                  {categoryLabel(group.category)}
                </p>
                {group.rows.map((line) => (
              <button
                type="button"
                className={`factory-order-line${line.isCancelled ? " is-cancelled" : ""}`}
                key={line.id}
                disabled={printBlocked || line.isCancelled}
                onClick={() => {
                  if (printBlocked || line.isCancelled) return;
                  setSelectedLineId(line.id);
                  setPrintError(false);
                  setPrintSuccess(null);
                }}
              >
                {line.requiresReprint ? (
                  <span
                    className="factory-order-line-print is-reprint"
                    aria-label={t("factoryBoard.labelRequiresReprint")}
                    title={t("factoryBoard.labelRequiresReprint")}
                  >
                    <TriangleAlert aria-hidden="true" />
                  </span>
                ) : line.printed ? (
                  <span
                    className="factory-order-line-print is-printed"
                    aria-label={t("factoryBoard.labelPrinted")}
                    title={t("factoryBoard.labelPrinted")}
                  >
                    <Printer aria-hidden="true" />
                  </span>
                ) : null}
                <div className="factory-order-line-body">
                  {line.isAddon ? <span className="factory-order-line-addon">加單</span> : null}
                  <strong>{line.label}</strong>
                  {line.isCancelled ? <span className="factory-order-line-cancelled">{t("factoryBoard.cancelled")}</span> : null}
                  {line.quantityText ? (
                    <span className="factory-order-line-quantity">
                      × {line.quantityText}
                    </span>
                  ) : null}
                  {line.remarks.filter(Boolean).map((remark, index) => (
                    <span
                      className="factory-order-line-remark"
                      key={`${remark}-${index}`}
                    >
                      {remark}
                    </span>
                  ))}
                </div>
              </button>
                ))}
              </Fragment>
            ))
          )}
        </div>
      </div>

      <aside className="factory-order-aside">
        {job?.removedLineChanges?.length ? (
          <div className="factory-removed-lines-alert" role="alert">
            <TriangleAlert aria-hidden="true" />
            <div>
              <strong>{t("factoryBoard.removedDishTitle")}</strong>
              <span>{t("factoryBoard.removedDishDescription")}</span>
              <ul>
                {job.removedLineChanges.map((change) => (
                  <li key={change.id}>{change.lineName || t("factoryBoard.unknownDish")}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
        <Button
          type="button"
          className="factory-order-print-action"
          disabled={printBlocked || !canPrint || !selectedPrinter || !printableLines.length || bulkPrinting !== null}
          onClick={() => void printAllLabels()}
        >
          {bulkPrinting === "all"
            ? t("factoryBoard.printing")
            : t("factoryBoard.printAll", { count: totalLabelCount })}
        </Button>
        <Button
          type="button"
          className="factory-order-print-action"
          disabled={printBlocked || !canPrint || !selectedPrinter || bulkPrinting !== null}
          onClick={() => void printAddressLabel()}
        >
          {bulkPrinting === "address" ? t("factoryBoard.printing") : t("factoryBoard.printAddress")}
        </Button>
        <Button
          type="button"
          className="factory-order-print-action"
          disabled={printBlocked || loading || error || !job}
          onClick={() => printPdf("送貨單", orderNumber === empty ? "" : orderNumber)}
        >
          {t("factoryBoard.printDeliveryNote")}
        </Button>
        <div className="factory-order-assign">
          <Button
            type="button"
            className="factory-order-selected"
            disabled={printBlocked}
            onClick={() => {
              setSelectedFleetId(assignedFleetId);
              setAssignError(false);
              setAssignOpen(true);
            }}
          >
            {assignedFleetId
              ? t("factoryBoard.selectedFleet", { name: selectedName })
              : t("factoryBoard.assignDriver")}
          </Button>
          {onBack ? (
            <button
              type="button"
              className="factory-order-return"
              onClick={onBack}
            >
              <ArrowLeft aria-hidden="true" />
              {t("factoryBoard.backToFactory")}
            </button>
          ) : null}
        </div>
        <hr />
        <label className="factory-order-printer">
          <span>{t("factoryBoard.connectPrinter")}</span>
          <select
            aria-label={t("factoryBoard.connectPrinter")}
            value={selectedPrinter}
            disabled={printBlocked || !canPrint}
            onChange={(event) => setSelectedPrinter(event.target.value)}
          >
            <option value="">
              {qz.printers.length
                ? t("factoryBoard.choosePrinter")
                : t("factoryBoard.noPrinter")}
            </option>
            {qz.printers.map((printer) => (
              <option key={printer} value={printer}>
                {printer}
              </option>
            ))}
          </select>
        </label>
      </aside>

      {printBlocked ? (
        <div className="factory-order-edit-lock-overlay" role="alert">
          <div className="factory-order-edit-lock-message">
            <TriangleAlert aria-hidden="true" />
            <strong>{t("factoryBoard.orderEditingPrintBlocked")}</strong>
          </div>
        </div>
      ) : null}

      <DeliveryNoteDocument order={item} job={job} printOnly />

      {dispatchOpen ? (
        <div className="factory-modal-root" role="presentation">
          <div
            className="factory-modal-backdrop"
            onClick={() => !savingDispatch && setDispatchOpen(false)}
          />
          <div
            className="factory-modal factory-dispatch-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="factory-dispatch-modal-title"
          >
            <header className="factory-modal-header">
              <h2 id="factory-dispatch-modal-title">{t("factoryBoard.editDispatchTime")}</h2>
            </header>
            <div className="factory-modal-body">
              <label className="factory-dispatch-time-field">
                <span>{t("factoryBoard.dispatchTime")}</span>
                <input
                  type="time"
                  value={dispatchDraft}
                  disabled={savingDispatch}
                  onChange={(event) => setDispatchDraft(event.target.value)}
                />
              </label>
              {dispatchError ? (
                <p className="factory-assignment-error" role="alert">
                  {t("factoryBoard.dispatchTimeUpdateError")}
                </p>
              ) : null}
            </div>
            <footer className="factory-modal-footer">
              <Button type="button" variant="outline" disabled={savingDispatch} onClick={() => setDispatchOpen(false)}>
                {t("factoryBoard.cancel")}
              </Button>
              <Button type="button" disabled={!dispatchDraft || savingDispatch} onClick={() => void submitDispatchTime()}>
                {savingDispatch ? t("factoryBoard.saving") : t("factoryBoard.saveDispatchTime")}
              </Button>
            </footer>
          </div>
        </div>
      ) : null}

      {assignOpen ? (
        <div className="factory-modal-root" role="presentation">
          <div
            className="factory-modal-backdrop"
            onClick={() => !assigning && setAssignOpen(false)}
          />
          <div
            className="factory-modal factory-driver-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="factory-driver-modal-title"
          >
            <header className="factory-modal-header">
              <h2 id="factory-driver-modal-title">
                {t("factoryBoard.assignDriverTitle", { order: orderNumber })}
              </h2>
            </header>
            <div className="factory-modal-body">
              <div className="factory-fleet-chips">
                {fleets.map((fleet) => (
                  <button
                    type="button"
                    className={
                      selectedFleetId === fleet.id
                        ? "factory-fleet-chip is-selected"
                        : "factory-fleet-chip"
                    }
                    key={fleet.id}
                    disabled={assigning}
                    onClick={() => setSelectedFleetId(fleet.id)}
                  >
                    {fleet.name}
                  </button>
                ))}
              </div>
              {fleets.length === 0 ? (
                <p className="factory-driver-empty">
                  {t("factoryBoard.noDrivers")}
                </p>
              ) : null}
              {assignError ? (
                <p className="factory-assignment-error" role="alert">
                  {t("factoryBoard.assignmentError")}
                </p>
              ) : null}
            </div>
            <footer className="factory-modal-footer">
              <Button
                type="button"
                variant="outline"
                disabled={assigning}
                onClick={() => setAssignOpen(false)}
              >
                {t("factoryBoard.close")}
              </Button>
              {assignedFleetId ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={assigning}
                  onClick={() => void submitAssignment("")}
                >
                  {t("factoryBoard.unassignDriver")}
                </Button>
              ) : null}
              <Button
                type="button"
                disabled={!selectedFleetId || assigning}
                onClick={() => void submitAssignment(selectedFleetId)}
              >
                {assigning
                  ? t("factoryBoard.assigning")
                  : t("factoryBoard.submit")}
              </Button>
            </footer>
          </div>
        </div>
      ) : null}

      {selectedLine ? (
        <div className="factory-modal-root" role="presentation">
          <div
            className="factory-modal-backdrop"
            onClick={() => !printing && setSelectedLineId(null)}
          />
          <div
            className="factory-modal factory-label-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="factory-label-modal-title"
          >
            <header className="factory-modal-header">
              <h2 id="factory-label-modal-title">
                {t("factoryBoard.printLabelsTitle")}
              </h2>
            </header>
            <div className="factory-modal-body">
              {selectedLine.requiresReprint ? (
                <div className="factory-label-reprint-alert" role="alert">
                  <strong>{t("factoryBoard.dishChangedReprint")}</strong>
                  {selectedLine.changes?.length ? (
                    <ul className="factory-label-change-details">
                      {selectedLine.changes.flatMap((change) => {
                        if (change.operation === "insert") {
                          return [
                            <li key={change.id}>{t("factoryBoard.dishAddedAfterPrint")}</li>,
                          ];
                        }
                        const fields = visibleFactoryChangeFields(change);
                        return fields.map(([field, values]) => (
                          <li key={`${change.id}-${field}`}>
                            <span>{t(factoryChangeFieldKeys[field])}</span>
                            {field === "product_id" || field === "package_id" ? (
                              <b>{t("factoryBoard.valueChanged")}</b>
                            ) : (
                              <b>
                                {factoryChangeValue(values.before, i18n.language, empty)}
                                {" → "}
                                {factoryChangeValue(values.after, i18n.language, empty)}
                              </b>
                            )}
                          </li>
                        ));
                      })}
                    </ul>
                  ) : (
                    <span className="factory-label-legacy-change">
                      {t("factoryBoard.legacyChangeDetailUnavailable")}
                    </span>
                  )}
                </div>
              ) : null}
              <div className="factory-label-summary">
                <div>
                  <span>{t("factoryBoard.originalName")}</span>
                  <strong className="factory-label-original-name">
                    {selectedLine.label}
                  </strong>
                  <span>{t("factoryBoard.labelName")}</span>
                  <div className="factory-label-database-names">
                    {selectedLabelNames.map((labelName, index) => (
                      <strong className="factory-label-database-name" key={`${labelName}-${index}`}>
                        {labelName.replace(/\r?\n/g, " ")}
                      </strong>
                    ))}
                  </div>
                </div>
                <div>
                  <span>{t("factoryBoard.orderedQuantity")}</span>
                  <strong>{selectedLine.quantityText ?? empty}</strong>
                </div>
                <div>
                  <span>{t("factoryBoard.alreadyPrinted")}</span>
                  <strong className={selectedLine.printed ? "is-printed" : ""}>
                    {selectedLine.printed ? (
                      <CheckCircle2 aria-label={t("factoryBoard.printedCheck")} />
                    ) : (
                      t("factoryBoard.notPrinted")
                    )}
                  </strong>
                </div>
              </div>
              {selectedLine.remarks.some(Boolean) ? (
                <div className="factory-label-remarks">
                  <span>{t("factoryBoard.dishRemarks")}</span>
                  {selectedLine.remarks.filter(Boolean).map((remark, index) => (
                    <strong key={`${remark}-${index}`}>{remark}</strong>
                  ))}
                </div>
              ) : null}
              <label className="factory-label-printer-select">
                <span>{t("factoryBoard.choosePrinter")}</span>
                <select
                  value={selectedPrinter}
                  disabled={printBlocked || !canPrint || printing}
                  onChange={(event) => setSelectedPrinter(event.target.value)}
                >
                  <option value="">{t("factoryBoard.noPrinter")}</option>
                  {qz.printers.map((printer) => (
                    <option key={printer} value={printer}>{printer}</option>
                  ))}
                </select>
              </label>
              {!canPrint ? (
                <p className="factory-label-print-error" role="alert">
                  {t("factoryBoard.connectPrinterBeforePrint")}
                </p>
              ) : null}
              {printError ? (
                <p className="factory-label-print-error" role="alert">
                  {t("factoryBoard.labelPrintError")}
                </p>
              ) : null}
              {printSuccess ? (
                <p className="factory-label-print-success" role="status">
                  <CheckCircle2 aria-hidden="true" />
                  {printSuccess}
                </p>
              ) : null}
              <div className="factory-label-actions">
                <Button
                  type="button"
                  disabled={printBlocked || !canPrint || !selectedPrinter || printing}
                  onClick={() => void printLine(selectedLine, true)}
                >
                  <Printer aria-hidden="true" />
                  {printing
                    ? t("factoryBoard.printing")
                    : t("factoryBoard.printFullLabelSet", {
                        count: labelCopies(selectedLine) * selectedLabelNames.length,
                      })}
                </Button>
                <Button
                  type="button"
                  className="factory-label-print-one"
                  disabled={printBlocked || !canPrint || !selectedPrinter || printing}
                  onClick={() => void printLine(selectedLine, false)}
                >
                  <Printer aria-hidden="true" />
                  {t("factoryBoard.printOneLabel", { count: selectedLabelNames.length })}
                </Button>
              </div>
            </div>
            <footer className="factory-modal-footer">
              <Button
                type="button"
                variant="outline"
                disabled={printing}
                onClick={() => setSelectedLineId(null)}
              >
                {t("factoryBoard.close")}
              </Button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
