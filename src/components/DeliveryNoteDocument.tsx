import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { formatDeliveryAddress } from "@/lib/delivery-address";
import {
  getBrandDisplayName,
  getBrandLogoAlt,
  getDocumentLogoPath,
} from "@/lib/brand-logo";
import {
  hongKongDateKey,
  type FactoryOrderJob,
} from "@/lib/factory-board";
import { formatFactoryOrderNumber } from "@/lib/factory-order-number";

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

export function formatDeliveryNoteWeekday(
  isoDate: string,
  language: string,
  empty: string,
) {
  if (!isoDate) return empty;
  if (language.startsWith("zh")) {
    return WEEKDAY_LONG_ZH[utcWeekdayIndex(isoDate)];
  }
  return new Intl.DateTimeFormat(language, {
    weekday: "long",
    timeZone: "UTC",
  }).format(
    new Date(
      Date.UTC(
        Number(isoDate.slice(0, 4)),
        Number(isoDate.slice(5, 7)) - 1,
        Number(isoDate.slice(8, 10)),
      ),
    ),
  );
}

export function formatFactoryDeliveryNoteQuantity(value: string | null) {
  const quantity = value?.trim() || "—";
  return quantity.replace(/(?:\s*份)+$/u, "").trim();
}

export type DeliveryNoteOrder = {
  orderNumber: string | null;
  customerName: string | null;
  companyName?: string | null;
  customerPhone: string | null;
  address: string | null;
  deliveryAt: string | null;
  deliveryTime: string | null;
  districtName: string | null;
  shippingMethodName: string | null;
  shopifyStoreDomain?: string | null;
};

/* A4 content box is 297mm minus 12mm top and 10mm bottom padding.
   Header, order line, and address block take about 100mm, leaving room
   for roughly 14 single-height rows before the footer. */
const DELIVERY_NOTE_PAGE_LINE_UNITS = 14;
const DELIVERY_NOTE_LINE_CHARACTERS = 28;

export function visibleDeliveryNoteRemarks(remarks: string[]) {
  return remarks.map((remark) => remark.trim()).filter(Boolean);
}

export function deliveryNoteRemarkText(remarks: string[]) {
  const visible = visibleDeliveryNoteRemarks(remarks);
  return visible.length ? `（${visible.join("、")}）` : "";
}

function textLineUnits(text: string) {
  const length = Array.from(text).length;
  if (!length) return 0;
  return Math.max(1, Math.ceil(length / DELIVERY_NOTE_LINE_CHARACTERS));
}

/* Long names stay inside the table: remarks drop to a second line instead
   of widening the row until the right border falls off the page. */
export function deliveryNoteLineLayout(label: string, remarks: string[]) {
  const remarkText = deliveryNoteRemarkText(remarks);
  const labelUnits = Math.max(1, textLineUnits(label));
  if (!remarkText) {
    return { remarkText, splitRemarks: false, units: labelUnits };
  }
  const combined = `${label} ${remarkText}`;
  if (Array.from(combined).length <= DELIVERY_NOTE_LINE_CHARACTERS) {
    return { remarkText, splitRemarks: false, units: 1 };
  }
  return {
    remarkText,
    splitRemarks: true,
    units: labelUnits + textLineUnits(remarkText),
  };
}

function paginateDeliveryNoteLines(lines: FactoryOrderJob["lines"]) {
  if (!lines.length) return [[]];
  const pages: FactoryOrderJob["lines"][] = [];
  let page: FactoryOrderJob["lines"] = [];
  let usedUnits = 0;

  for (const line of lines) {
    const lineUnits = deliveryNoteLineLayout(
      line.label,
      line.remarks,
    ).units;
    if (page.length && usedUnits + lineUnits > DELIVERY_NOTE_PAGE_LINE_UNITS) {
      pages.push(page);
      page = [];
      usedUnits = 0;
    }
    page.push(line);
    usedUnits += lineUnits;
  }
  if (page.length) pages.push(page);
  return pages;
}

export function DeliveryNoteDocument({
  order,
  job,
  printOnly = false,
  className,
}: {
  order: DeliveryNoteOrder;
  job: FactoryOrderJob | null;
  printOnly?: boolean;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const empty = t("common.notSet");
  const dateKey = order.deliveryAt ? hongKongDateKey(order.deliveryAt) : "";
  const weekday = formatDeliveryNoteWeekday(dateKey, i18n.language, empty);
  const orderNumber = formatFactoryOrderNumber(order.orderNumber, empty);
  const arrivalWindow = job?.arrivalWindow || order.deliveryTime || empty;
  const customerName =
    order.customerName?.trim() || order.companyName?.trim() || empty;
  const brandValues = [
    job?.brandName,
    order.shopifyStoreDomain,
    order.orderNumber,
  ];
  const brandName = getBrandDisplayName(...brandValues);
  const visibleLines =
    job?.lines.filter(
      (line) => !line.isCancelled && line.label.trim().length > 0,
    ) ?? [];
  const linePages = paginateDeliveryNoteLines(visibleLines);
  const totalPages = linePages.length;

  return (
    <>
      {linePages.map((pageLines, pageIndex) => (
        <section
          className={cn(
            printOnly
              ? "factory-delivery-note-print"
              : "order-delivery-note-sheet",
            pageIndex === totalPages - 1 && "is-final-page",
            className,
          )}
          aria-label={t("factoryBoard.deliveryNoteTitle")}
          key={`delivery-note-page-${pageIndex}`}
        >
      <header className="factory-delivery-note-header">
        <div className="factory-delivery-note-brand">
          <img
            src={getDocumentLogoPath(...brandValues)}
            alt={getBrandLogoAlt(...brandValues)}
          />
        </div>
        <h1>{t("factoryBoard.deliveryNoteTitle")}</h1>
        <p className="factory-delivery-note-cartons">
          {t("factoryBoard.cartons")}: ______
        </p>
      </header>

      <h2>
        {orderNumber} {order.districtName || ""}
      </h2>

      <div className="factory-delivery-note-details">
        <section>
          <h3>{t("factoryBoard.customerAndDeliveryAddress")}</h3>
          <p>{customerName}</p>
          <p>
            {formatDeliveryAddress(
              order.address,
              order.shippingMethodName,
              empty,
            )}
          </p>
          {job?.customerNote ? <p>* {job.customerNote}</p> : null}
          <p className="factory-delivery-note-contact">
            {t("factoryBoard.contactPerson")}: {customerName}{" "}
            <span>{order.customerPhone || empty}</span>
          </p>
        </section>
        <section>
          <p className="factory-delivery-note-order-reference">
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
          {pageLines.map((line) => {
            const layout = deliveryNoteLineLayout(line.label, line.remarks);
            return (
              <tr key={line.id}>
                <td>
                  {t("factoryBoard.portionUnit", {
                    count: formatFactoryDeliveryNoteQuantity(line.quantityText),
                  })}
                </td>
                <td>
                  {layout.splitRemarks ? (
                    <>
                      <span className="factory-delivery-note-line-label">
                        {line.label}
                      </span>
                      <span className="factory-delivery-note-line-remarks">
                        {layout.remarkText}
                      </span>
                    </>
                  ) : (
                    <>
                      {line.label}
                      {layout.remarkText ? ` ${layout.remarkText}` : ""}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <footer>
        <span className="factory-delivery-note-brand-footer">
          {brandName}
          {job?.brandWebsite ? <><br />{job.brandWebsite}</> : null}
        </span>
        <span className="factory-delivery-note-page-footer">
          {pageIndex + 1} / {totalPages}
        </span>
      </footer>
        </section>
      ))}
    </>
  );
}
