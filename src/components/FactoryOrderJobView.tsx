import { useEffect, useState } from "react";
import { CheckCircle2, Printer, ShoppingCart } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  assignDeliveryMotorcade,
  type DeliveryListItem,
} from "@/lib/deliveries";
import {
  buildFactoryDishLabelHtml,
  hongKongDateKey,
  markFactoryOrderLinePrinted,
  type FactoryFleet,
  type FactoryOrderLine,
  type FactoryOrderJob,
} from "@/lib/factory-board";
import { useQzTray } from "@/lib/qz-tray";

const WEEKDAY_LONG_ZH = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
];

function utcWeekdayIndex(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1)).getUTCDay();
}

export function formatFactoryDeliveryNoteQuantity(value: string | null) {
  const quantity = value?.trim() || "—";
  return quantity.replace(/(?:\s*份)+$/u, "").trim();
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
  onLinePrinted,
  onAssigned,
  qz,
  onBack,
}: {
  item: DeliveryListItem;
  job: FactoryOrderJob | null;
  loading: boolean;
  error: boolean;
  selectedBadge?: string;
  fleets: FactoryFleet[];
  assignMotorcade?: typeof assignDeliveryMotorcade;
  markLinePrinted?: typeof markFactoryOrderLinePrinted;
  onLinePrinted?: (lineId: string) => void;
  onAssigned?: (fleet: FactoryFleet) => void;
  qz: ReturnType<typeof useQzTray>;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [assignedFleetId, setAssignedFleetId] = useState(item.motorcadeId ?? "");
  const [selectedFleetId, setSelectedFleetId] = useState(item.motorcadeId ?? "");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState(false);
  const [printSuccess, setPrintSuccess] = useState<string | null>(null);
  const empty = t("common.notSet");
  const canPrint = qz.state === "connected";
  const dateKey = item.deliveryAt ? hongKongDateKey(item.deliveryAt) : "";
  const weekday = dateKey
    ? i18n.language.startsWith("zh")
      ? WEEKDAY_LONG_ZH[utcWeekdayIndex(dateKey)]
      : new Intl.DateTimeFormat(i18n.language, {
          weekday: "long",
          timeZone: "UTC",
        }).format(
          new Date(
            Date.UTC(
              Number(dateKey.slice(0, 4)),
              Number(dateKey.slice(5, 7)) - 1,
              Number(dateKey.slice(8, 10)),
            ),
          ),
        )
    : empty;
  const orderNumber = item.orderNumber?.replace(/^#/, "") || empty;
  const dispatchTime = job?.dispatchTime || item.deliveryTime || empty;
  const arrivalWindow = job?.arrivalWindow || empty;
  const assignedFleet = fleets.find((fleet) => fleet.id === assignedFleetId);
  const selectedLine = job?.lines.find((line) => line.id === selectedLineId) ?? null;
  const selectedName =
    assignedFleet?.shortName ||
    assignedFleet?.name ||
    selectedBadge ||
    item.motorcadeName ||
    t("factoryBoard.unassignedFleet");
  const visibleLines =
    job?.lines.filter((line) => line.label.trim().length > 0) ?? [];

  useEffect(() => {
    setAssignedFleetId(item.motorcadeId ?? "");
    setSelectedFleetId(item.motorcadeId ?? "");
  }, [item.motorcadeId]);

  useEffect(() => {
    if (!qz.printers.length) {
      setSelectedPrinter("");
      return;
    }
    setSelectedPrinter((current) =>
      qz.printers.includes(current) ? current : qz.printers[0]!,
    );
  }, [qz.printers]);

  const labelCopies = (line: FactoryOrderLine) => {
    const match = line.quantityText?.match(/\d+(?:\.\d+)?/);
    const quantity = match ? Number(match[0]) : 1;
    return Number.isFinite(quantity) ? Math.max(1, Math.ceil(quantity)) : 1;
  };

  const printLine = async (line: FactoryOrderLine, fullSet: boolean) => {
    if (qz.state !== "connected" || !selectedPrinter) return;
    setPrinting(true);
    setPrintError(false);
    setPrintSuccess(null);
    try {
      const copies = fullSet ? labelCopies(line) : 1;
      await qz.printLabels(
        selectedPrinter,
        buildFactoryDishLabelHtml({
          orderNumber,
          dish: line.label,
          quantity: line.quantityText,
          remarks: line.remarks,
          deliveryDate: dateKey,
          deliveryTime: dispatchTime === empty ? null : dispatchTime,
          packingNote: job?.packingNote ?? null,
        }),
        copies,
      );
      if (fullSet) {
        await markLinePrinted(line.id);
        onLinePrinted?.(line.id);
      }
      setPrintSuccess(
        fullSet
          ? t("factoryBoard.fullLabelPrintSuccess")
          : t("factoryBoard.singleLabelPrintSuccess"),
      );
    } catch {
      setPrintError(true);
    } finally {
      setPrinting(false);
    }
  };

  const submitAssignment = async () => {
    const fleet = fleets.find((entry) => entry.id === selectedFleetId);
    if (!fleet) return;
    setAssigning(true);
    setAssignError(false);
    setAssignSuccess(false);
    try {
      await assignMotorcade(item.id, fleet.id);
      setAssignedFleetId(fleet.id);
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
      <div className="factory-order-main">
        <div className="factory-order-summary">
          <h1 className="factory-order-number">{orderNumber}</h1>
          <dl className="factory-order-meta">
            <div>
              {dateKey
                ? t("factoryBoard.orderDate", {
                    month: dateKey.slice(5, 7),
                    day: dateKey.slice(8, 10),
                    weekday,
                  })
                : empty}
            </div>
            <div>
              {t("factoryBoard.dispatchTime")}: {dispatchTime}
            </div>
            <div>
              {t("factoryBoard.arrivalWindow")}: {arrivalWindow}
            </div>
            <div>
              {t("factoryBoard.phone")}: {item.customerPhone || empty}
            </div>
            <div className="is-address">
              {t("factoryBoard.address")}: {item.address || empty}
              {item.shippingMethodName ? ` * ${item.shippingMethodName}` : ""}
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
          ) : !visibleLines.length ? (
            <p className="factory-day-state">{t("factoryBoard.emptyLines")}</p>
          ) : (
            visibleLines.map((line) => (
              <button
                type="button"
                className="factory-order-line"
                key={line.id}
                onClick={() => {
                  setSelectedLineId(line.id);
                  setPrintError(false);
                  setPrintSuccess(null);
                }}
              >
                {line.printed ? (
                  <span
                    className="factory-order-line-print is-printed"
                    aria-label={t("factoryBoard.labelPrinted")}
                    title={t("factoryBoard.labelPrinted")}
                  >
                    <Printer aria-hidden="true" />
                  </span>
                ) : null}
                <div className="factory-order-line-body">
                  <strong>{line.label}</strong>
                  {line.quantityText ? (
                    <span className="factory-order-line-quantity">
                      × {line.quantityText}
                    </span>
                  ) : null}
                  {line.remarks.map((remark, index) => (
                    <span
                      className="factory-order-line-remark"
                      key={`${remark}-${index}`}
                    >
                      {remark}
                    </span>
                  ))}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <aside className="factory-order-aside">
        <Button type="button" disabled={!canPrint}>
          {t("factoryBoard.printAll")}
        </Button>
        <Button type="button" disabled={!canPrint}>
          {t("factoryBoard.printAddress")}
        </Button>
        <Button
          type="button"
          disabled={loading || error || !job}
          onClick={() => window.print()}
        >
          {t("factoryBoard.printDeliveryNote")}
        </Button>
        <Button
          type="button"
          className="factory-order-selected"
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
        {assignSuccess ? (
          <p className="factory-assignment-success" role="status">
            <CheckCircle2 aria-hidden="true" />
            {t("factoryBoard.assignmentSuccess")}
          </p>
        ) : null}
        <hr />
        <Button
          type="button"
          variant="outline"
          className="factory-order-back"
          onClick={onBack}
        >
          {t("factoryBoard.back")}
        </Button>
        <label className="factory-order-printer">
          <span>{t("factoryBoard.connectPrinter")}</span>
          <select
            aria-label={t("factoryBoard.connectPrinter")}
            value={selectedPrinter}
            disabled={!canPrint}
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

      <section className="factory-delivery-note-print" aria-hidden="true">
        <header className="factory-delivery-note-header">
          <div className="factory-delivery-note-brand">
            <strong>FC</strong>
            <span>
              Food <b>CATERING</b>
              <br />
              Channels
            </span>
          </div>
          <h1>{t("factoryBoard.deliveryNoteTitle")}</h1>
          <p className="factory-delivery-note-cartons">
            {t("factoryBoard.cartons")}: ______
          </p>
        </header>

        <h2>
          {orderNumber} {item.districtName || ""}
        </h2>

        <div className="factory-delivery-note-details">
          <section>
            <h3>{t("factoryBoard.customerAndDeliveryAddress")}</h3>
            <p>{item.customerName || empty}</p>
            <p>{item.address || empty}</p>
            {job?.packingNote ? <p>* {job.packingNote}</p> : null}
            <p>
              {t("factoryBoard.contactPerson")}: {item.customerName || empty}
            </p>
            <p>{item.customerPhone || empty}</p>
          </section>
          <section>
            <p>
              {t("factoryBoard.orderLabel")} {orderNumber}
            </p>
            <p>
              {t("factoryBoard.deliveryDate")}: {dateKey || empty}
            </p>
            <p>
              {t("factoryBoard.arrivalWindow")}: {arrivalWindow}
            </p>
            <p>
              {t("factoryBoard.deliveryDay")}: {weekday}
            </p>
          </section>
        </div>

        <table className="factory-delivery-note-lines">
          <thead>
            <tr>
              <th aria-label={t("factoryBoard.orderedQuantity")} />
              <th>{t("factoryBoard.orderContent")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleLines.map((line) => (
              <tr key={line.id}>
                <td>
                  {t("factoryBoard.portionUnit", {
                    count: formatFactoryDeliveryNoteQuantity(line.quantityText),
                  })}
                </td>
                <td>
                  {line.label}
                  {line.remarks.length ? `（${line.remarks.join("、")}）` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer>
          <span className="factory-delivery-note-order-footer">
            {orderNumber}
          </span>
          <span className="factory-delivery-note-brand-footer">
            {job?.brandName || "Food Channels Catering"}
            {job?.brandWebsite ? <><br />{job.brandWebsite}</> : null}
          </span>
        </footer>
      </section>

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
              <Button
                type="button"
                disabled={!selectedFleetId || assigning}
                onClick={() => void submitAssignment()}
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
              {selectedLine.requiresReprint || job?.requiresReprint ? (
                <div className="factory-label-reprint-alert" role="alert">
                  {t("factoryBoard.dishChangedReprint")}
                </div>
              ) : null}
              <div className="factory-label-summary">
                <div>
                  <span>{t("factoryBoard.label")}</span>
                  <strong>{selectedLine.label}</strong>
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
              {selectedLine.remarks.length ? (
                <div className="factory-label-remarks">
                  <span>{t("factoryBoard.dishRemarks")}</span>
                  {selectedLine.remarks.map((remark) => (
                    <strong key={remark}>{remark}</strong>
                  ))}
                </div>
              ) : null}
              <label className="factory-label-printer-select">
                <span>{t("factoryBoard.choosePrinter")}</span>
                <select
                  value={selectedPrinter}
                  disabled={!canPrint || printing}
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
                  disabled={!canPrint || !selectedPrinter || printing}
                  onClick={() => void printLine(selectedLine, true)}
                >
                  <Printer aria-hidden="true" />
                  {printing
                    ? t("factoryBoard.printing")
                    : t("factoryBoard.printFullLabelSet", {
                        count: labelCopies(selectedLine),
                      })}
                </Button>
                <Button
                  type="button"
                  className="factory-label-print-one"
                  disabled={!canPrint || !selectedPrinter || printing}
                  onClick={() => void printLine(selectedLine, false)}
                >
                  <Printer aria-hidden="true" />
                  {t("factoryBoard.printOneLabel")}
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
