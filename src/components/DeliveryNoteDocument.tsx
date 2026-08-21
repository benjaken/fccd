import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { formatDeliveryAddress } from "@/lib/delivery-address";
import {
  getBrandLogoAlt,
  getDocumentLogoPath,
} from "@/lib/brand-logo";
import {
  hongKongDateKey,
  type FactoryOrderJob,
} from "@/lib/factory-board";

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
  const orderNumber = order.orderNumber?.replace(/^#/, "") || empty;
  const arrivalWindow = job?.arrivalWindow || order.deliveryTime || empty;
  const customerName =
    order.customerName?.trim() || order.companyName?.trim() || empty;
  const brandValues = [
    job?.brandName,
    order.shopifyStoreDomain,
    order.orderNumber,
  ];
  const brandName = job?.brandName || getBrandLogoAlt(...brandValues);
  const visibleLines =
    job?.lines.filter((line) => line.label.trim().length > 0) ?? [];

  return (
    <section
      className={cn(
        printOnly
          ? "factory-delivery-note-print"
          : "order-delivery-note-sheet",
        className,
      )}
      aria-label={t("factoryBoard.deliveryNoteTitle")}
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
          {brandName}
          {job?.brandWebsite ? <><br />{job.brandWebsite}</> : null}
        </span>
        <span className="factory-delivery-note-page-footer">1 / 1</span>
      </footer>
    </section>
  );
}
